import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";
import { v4 as uuidv4 } from "uuid";
import cssSelectors from "../data/cssSelectors.json";
import { WebSocket } from "ws";
import prisma from "@/lib/prismaClient";
import Redis from "ioredis";

interface Session {
  browser: Browser;
  page: Page;
  isMonitoring: boolean;
}

const sessions: Map<string, Session> = new Map();

export async function launchWhatsAppSession(
  wsClients: Map<string, Set<WebSocket>>,
  redis: Redis,
  existingSessionId?: string
): Promise<{
  sessionId: string;
  browser: Browser;
  page: Page;
  qrCode: string;
}> {
  const sessionId = existingSessionId || uuidv4();
  if (sessions.has(sessionId)) {
    const { browser, page } = sessions.get(sessionId)!;
    const qrCode = await refreshWhatsAppPage(page);
    return { sessionId, browser, page, qrCode };
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
  sessions.set(sessionId, { browser, page, isMonitoring: true });
  console.log(`Current sessions: ${sessions.size}`);

  const sessionData = {
    sessionId,
    userId: "",
    botStepStatus: "QRCODE",
  };
  await redis.set(
    `whatsapp:session:${sessionId}`,
    JSON.stringify(sessionData),
    "EX",
    3600
  );

  const qrCodeSelector = cssSelectors.qrCodeSelector;
  let qrCode: string = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.waitForSelector(qrCodeSelector, { timeout: 30000 });
      qrCode = await page.$eval(
        qrCodeSelector,
        (el: Element): string => {
          const canvas = el as HTMLCanvasElement;
          return canvas.toDataURL("image/png");
        }
      );
      console.log(
        `QR code extracted for session ${sessionId}: ${qrCode.substring(0, 50)}...`
      );
      break;
    } catch (error) {
      console.error(
        `Attempt ${attempt} to capture QR code for session ${sessionId} failed:`,
        error
      );
      if (attempt === 3) {
        await cleanupSession(sessionId);
        throw new Error("Failed to capture QR code after 3 attempts");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!qrCode) {
    await cleanupSession(sessionId);
    throw new Error("Failed to capture QR code");
  }

  const monitorScan = async () => {
    const session = sessions.get(sessionId);
    if (!session || !session.isMonitoring) return;

    let attempts = 0;
    const maxAttempts = 12;
    while (attempts < maxAttempts) {
      try {
        if (page.isClosed()) {
          console.log(`Page closed for session ${sessionId}, stopping monitor`);
          return;
        }
        const qrStillPresent = await page.$(qrCodeSelector);
        if (!qrStillPresent) {
          console.log(`QR code scanned for session ${sessionId}`);
          sessionData.botStepStatus = "AUTHENTICATED";
          await redis.set(
            `whatsapp:session:${sessionId}`,
            JSON.stringify(sessionData),
            "EX",
            3600
          );
          await prisma.whatsAppSessions.update({
            where: { sessionId },
            data: { botStepStatus: "AUTHENTICATED" },
          });
          console.log(`Session ${sessionId} updated to AUTHENTICATED`);

          try {
            await page.waitForSelector("div[role='listbox']", { timeout: 90000 });
            console.log(`Chat list appeared for session ${sessionId}`);

            let continueButton: ElementHandle<Element> | null = null;
            for (let buttonAttempt = 1; buttonAttempt <= 5; buttonAttempt++) {
              try {
                await page.waitForSelector(
                  cssSelectors.welcomeModalContinueButtonSelector,
                  { timeout: 5000 }
                );
                continueButton = await page.$(
                  cssSelectors.welcomeModalContinueButtonSelector
                );
                if (continueButton) {
                  await continueButton.click();
                  console.log(
                    `Clicked Continue button for session ${sessionId} via selector`
                  );
                  break;
                }
              } catch (error) {
                console.log(
                  `Continue button not found for session ${sessionId}, attempt ${buttonAttempt}`
                );
                try {
                  await page.evaluate((xpath: string) => {
                    const element = document.evaluate(
                      xpath,
                      document,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null
                    ).singleNodeValue;
                    if (element) (element as HTMLElement).click();
                  }, cssSelectors.welcomeModalContinueButtonXPath);
                  console.log(
                    `Clicked Continue button via XPath for session ${sessionId}`
                  );
                  break;
                } catch (xpathError) {
                  console.log(
                    `XPath click failed for session ${sessionId}:`,
                    xpathError
                  );
                }
                try {
                  await page.evaluate(() => {
                    const button = document.querySelector("button[aria-label='Continue']");
                    if (button) (button as HTMLElement).click();
                  });
                  console.log(
                    `Clicked Continue button via aria-label for session ${sessionId}`
                  );
                  break;
                } catch (ariaError) {
                  console.log(
                    `Aria-label click failed for session ${sessionId}:`,
                    ariaError
                  );
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            const chats = await page.evaluate(() => {
              const chatElements = document.querySelectorAll("div[role='listitem']");
              const chatList: { id: string; name: string; image: string }[] = [];
              chatElements.forEach((element, index) => {
                if (index >= 10) return;
                const id = element.getAttribute("data-id") || `chat-${index}`;
                const nameElement = element.querySelector("span[title]");
                const name = nameElement
                  ? nameElement.getAttribute("title") || "Unknown"
                  : "Unknown";
                const imageElement = element.querySelector("img");
                const image = imageElement
                  ? imageElement.src
                  : "https://placehold.co/600x400";
                chatList.push({ id, name, image });
              });
              return chatList;
            });
            console.log(
              `Fetched ${chats.length} chats for session ${sessionId}`
            );

            wsClients.get(sessionId)?.forEach((ws) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    sessionId,
                    status: "AUTHENTICATED",
                    message: "Fetching chats...",
                  })
                );
                if (chats.length > 0) {
                  ws.send(
                    JSON.stringify({
                      sessionId,
                      status: "AUTHENTICATED",
                      message: "Chats loaded",
                      chats,
                    })
                  );
                  console.log(
                    `Notified frontend for session ${sessionId}: Chats loaded`
                  );
                }
              }
            });
          } catch (error) {
            console.error(
              `Failed to fetch chats for session ${sessionId}:`,
              error
            );
          }
          break;
        }
      } catch (error) {
        console.error(
          `Error monitoring QR code scan for session ${sessionId}:`,
          error
        );
        if (String(error).includes("detached Frame")) {
          console.log(
            `Page detached for session ${sessionId}, stopping monitor`
          );
          await cleanupSession(sessionId);
          return;
        }
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  };

  monitorScan().catch((err) =>
    console.error(`Monitor scan error for session ${sessionId}:`, err)
  );
  return { sessionId, browser, page, qrCode };
}

export async function refreshWhatsAppPage(page: Page): Promise<string> {
  await page.reload({ waitUntil: "networkidle2" });
  const qrCodeSelector = cssSelectors.qrCodeSelector;
  let qrCode: string = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.waitForSelector(qrCodeSelector, { timeout: 30000 });
      qrCode = await page.$eval(
        qrCodeSelector,
        (el: Element): string => {
          const canvas = el as HTMLCanvasElement;
          return canvas.toDataURL("image/png");
        }
      );
      console.log(
        `Refreshed QR code extracted for session: ${qrCode.substring(0, 50)}...`
      );
      break;
    } catch (error) {
      console.error(`QR code refresh attempt ${attempt} failed:`, error);
      if (attempt === 3)
        throw new Error("Failed to capture refreshed QR code after 3 attempts");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!qrCode) throw new Error("Failed to capture refreshed QR code");
  return qrCode;
}

export async function cleanupSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.isMonitoring = false;
  if (!session.page.isClosed()) await session.page.close();
  if (session.browser.isConnected()) await session.browser.close();
  sessions.delete(sessionId);
  console.log(
    `Cleaned up session ${sessionId}, current sessions: ${sessions.size}`
  );
}