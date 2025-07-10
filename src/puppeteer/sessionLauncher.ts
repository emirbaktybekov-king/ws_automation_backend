import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";
import { v4 as uuidv4 } from "uuid";
import cssSelectors from "../data/cssSelectors.json";
import { WebSocket } from "ws";
import prisma from "@/lib/prismaClient";
import Redis from "ioredis";

export async function launchWhatsAppSession(
  wsClients: Map<string, WebSocket>,
  redis: Redis,
  existingSessionId?: string
): Promise<{
  sessionId: string;
  browser: Browser;
  page: Page;
  qrCode: string;
}> {
  const sessionId = existingSessionId || uuidv4();
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

  // Store minimal session metadata in Redis
  const sessionData = {
    sessionId,
    userId: "", // Will be set in createSession
    botStepStatus: "QRCODE",
  };
  await redis.set(
    `whatsapp:session:${sessionId}`,
    JSON.stringify(sessionData),
    "EX",
    3600 // Expire after 1 hour
  );

  // Use selector from JSON
  const qrCodeSelector = cssSelectors.qrCodeSelector;
  let qrCode: string | undefined;

  // Attempt to find QR code canvas with timeout
  let canvas: ElementHandle<Element> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.waitForSelector(qrCodeSelector, { timeout: 10000 });
      canvas = await page.$(qrCodeSelector);
      if (canvas) {
        qrCode = await canvas.evaluate((el) => {
          const dataUrl = (el as HTMLCanvasElement).toDataURL("image/png");
          console.log("QR code extracted:", dataUrl.substring(0, 50) + "...");
          return dataUrl;
        });
        break;
      } else {
        console.log(
          `QR code canvas not found on attempt ${attempt}, capturing screenshot`
        );
        const qrArea = await page.$(cssSelectors.qrAreaSelector);
        if (qrArea) {
          qrCode = await qrArea.screenshot({ encoding: "base64", type: "png" });
          qrCode = `data:image/png;base64,${qrCode}`;
          console.log(
            "QR code screenshot captured:",
            qrCode.substring(0, 50) + "..."
          );
          break;
        }
      }
    } catch (error) {
      console.error(
        `Attempt ${attempt} to capture QR code for session ${sessionId} failed:`,
        error
      );
      if (attempt === 3) {
        await browser.close();
        await redis.del(`whatsapp:session:${sessionId}`);
        throw new Error("Failed to capture QR code area after 3 attempts");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!qrCode) {
    await browser.close();
    await redis.del(`whatsapp:session:${sessionId}`);
    throw new Error("Failed to capture QR code area");
  }

  // Monitor QR code scan
  const monitorScan = async () => {
    let attempts = 0;
    const maxAttempts = 12; // 60 seconds total (5s * 12)
    while (attempts < maxAttempts) {
      try {
        const qrStillPresent = await page.$(qrCodeSelector);
        if (!qrStillPresent) {
          console.log(`QR code scanned for session ${sessionId}`);
          // Update session status in Redis and Prisma
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

          // Wait for loading element to disappear
          try {
            await page.waitForSelector(cssSelectors.loadingChatsSelector, {
              timeout: 10000,
            });
            await page.waitForSelector(cssSelectors.loadingChatsSelector, {
              hidden: true,
              timeout: 30000,
            });
            console.log(
              `Loading chats element disappeared for session ${sessionId}`
            );
          } catch (error) {
            console.log(
              `Loading chats element not found or did not disappear for session ${sessionId}:`,
              error
            );
          }

          // Retry clicking the Continue button
          let continueButton: ElementHandle<Element> | null = null;
          let buttonAttempts = 0;
          const maxButtonAttempts = 5; // Try for 10 seconds (2s * 5)
          while (buttonAttempts < maxButtonAttempts) {
            try {
              await page.waitForSelector(
                cssSelectors.welcomeModalContinueButtonSelector,
                { timeout: 2000 }
              );
              continueButton = await page.$(
                cssSelectors.welcomeModalContinueButtonSelector
              );
              if (continueButton) {
                await continueButton.click();
                console.log(`Clicked Continue button for session ${sessionId}`);
                break;
              }
            } catch (error) {
              console.log(
                `Continue button not found for session ${sessionId}, attempt ${buttonAttempts + 1}`
              );
              try {
                await page.evaluate((xpath) => {
                  const element = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                  ).singleNodeValue;
                  if (element) {
                    (element as HTMLElement).click();
                  }
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
            }
            buttonAttempts++;
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          if (!continueButton) {
            console.error(
              `Failed to click Continue button after ${maxButtonAttempts} attempts for session ${sessionId}`
            );
          }

          // Fetch top 10 chats
          try {
            await page.waitForSelector(
              "#pane-side > div:nth-child(2) > div > div",
              { timeout: 10000 }
            );
            const chats = await page.evaluate(() => {
              const chatElements = document.querySelectorAll(
                "#pane-side > div:nth-child(2) > div > div > div.x10l6tqk.xh8yej3.x1g42fcv[role='listitem']"
              );
              const chatList: { id: string; name: string; image: string }[] =
                [];
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

            // Notify frontend via WebSocket with retries
            let wsAttempts = 0;
            const maxWsAttempts = 5;
            const sendWsMessage = async () => {
              const ws = wsClients.get(sessionId);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    sessionId,
                    status: "AUTHENTICATED",
                    message: "Fetching chats...",
                  })
                );
                console.log(
                  `Notified frontend for session ${sessionId}: Fetching chats...`
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
              } else if (wsAttempts < maxWsAttempts) {
                console.log(
                  `WebSocket client not ready for session ${sessionId}, retrying attempt ${wsAttempts + 1}`
                );
                wsAttempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await sendWsMessage();
              } else {
                console.error(
                  `Failed to send WebSocket message for session ${sessionId} after ${maxWsAttempts} attempts`
                );
              }
            };
            await sendWsMessage();
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
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  };

  // Start monitoring in the background
  monitorScan().catch((err) =>
    console.error(`Monitor scan error for session ${sessionId}:`, err)
  );

  return { sessionId, browser, page, qrCode };
}

export async function refreshWhatsAppPage(page: Page): Promise<string> {
  await page.reload({ waitUntil: "networkidle2" });

  const qrCodeSelector = cssSelectors.qrCodeSelector;
  let qrCode: string | undefined;

  let canvas: ElementHandle<Element> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.waitForSelector(qrCodeSelector, { timeout: 10000 });
      canvas = await page.$(qrCodeSelector);
      if (canvas) {
        qrCode = await canvas.evaluate((el) => {
          const dataUrl = (el as HTMLCanvasElement).toDataURL("image/png");
          console.log(
            "Refreshed QR code extracted:",
            dataUrl.substring(0, 50) + "..."
          );
          return dataUrl;
        });
        break;
      } else {
        console.log(`QR code canvas not found on refresh, attempt ${attempt}`);
        const qrArea = await page.$(cssSelectors.qrAreaSelector);
        if (qrArea) {
          qrCode = await qrArea.screenshot({ encoding: "base64", type: "png" });
          qrCode = `data:image/png;base64,${qrCode}`;
          console.log(
            "Refreshed QR code screenshot captured:",
            qrCode.substring(0, 50) + "..."
          );
          break;
        }
      }
    } catch (error) {
      console.error(`QR code refresh attempt ${attempt} failed:`, error);
      if (attempt === 3) {
        throw new Error(
          "Failed to capture refreshed QR code area after 3 attempts"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!qrCode) {
    throw new Error("Failed to capture refreshed QR code area");
  }

  return qrCode;
}
