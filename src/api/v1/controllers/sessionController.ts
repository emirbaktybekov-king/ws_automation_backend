import { Request, Response } from "express";
import { WebSocket } from "ws";
import prisma from "@/lib/prismaClient";
import Redis from "ioredis";
import {
  launchWhatsAppSession,
  refreshWhatsAppPage,
} from "@/puppeteer/sessionLauncher";

export const createSession = async (
  req: Request,
  res: Response,
  wsClients: Map<string, WebSocket>,
  redis: Redis
) => {
  const userId = req.user?.id;
  if (!userId) {
    console.error("No userId found in request");
    return res.status(401).json({ error: "Unauthorized: No user ID provided" });
  }

  try {
    // Fetch and clean up all existing QRCODE sessions for the user
    const existingSessions = await prisma.whatsAppSessions.findMany({
      where: { userId, botStepStatus: "QRCODE" },
    });

    // Delete sessions from Redis and Prisma
    for (const existingSession of existingSessions) {
      try {
        await redis.del(`whatsapp:session:${existingSession.sessionId}`);
        await prisma.whatsAppSessions.delete({
          where: { id: existingSession.id },
        });
        console.log(
          `Deleted existing session ${existingSession.sessionId} from database and Redis`
        );
      } catch (err) {
        console.error(
          `Failed to delete existing session ${existingSession.sessionId}:`,
          err
        );
      }
    }

    // Create new session
    let sessionData;
    const maxRetries = 5;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        sessionData = await launchWhatsAppSession(wsClients, redis);
        break;
      } catch (error) {
        attempt++;
        console.error(
          `Session creation attempt ${attempt} failed for userId ${userId}:`,
          error
        );
        if (attempt === maxRetries) {
          throw new Error(`Max retries reached for session creation: ${error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!sessionData) {
      throw new Error("Failed to create session after retries");
    }

    const { sessionId, browser, page, qrCode } = sessionData;
    console.log(
      `Created new session ${sessionId} for userId ${userId}, QR code:`,
      qrCode.substring(0, 50) + "..."
    );

    // Create new session in Prisma
    const session = await prisma.whatsAppSessions.create({
      data: {
        userId,
        sessionId,
        botStepStatus: "QRCODE",
      },
    });

    // Update Redis with userId
    const redisSession = { sessionId, userId, botStepStatus: "QRCODE" };
    await redis.set(
      `whatsapp:session:${sessionId}`,
      JSON.stringify(redisSession),
      "EX",
      3600
    );

    // Close Puppeteer instance to avoid memory leaks
    await browser.close();

    res.status(201).json({ sessionId: session.sessionId, qrCode });
  } catch (error) {
    console.error(`Session creation failed for userId ${userId}:`, error);
    res.status(500).json({ error: "Session creation failed" });
  }
};

export const refreshSession = async (
  req: Request,
  res: Response,
  wsClients: Map<string, WebSocket>,
  redis: Redis
) => {
  const { sessionId } = req.body;
  const userId = req.user?.id;
  if (!userId || !sessionId) {
    console.error("Missing userId or sessionId in refresh request");
    return res.status(401).json({ error: "Unauthorized or missing sessionId" });
  }

  const sessionData = await redis.get(`whatsapp:session:${sessionId}`);
  if (!sessionData) {
    const dbSession = await prisma.whatsAppSessions.findUnique({
      where: { sessionId },
    });
    if (!dbSession) {
      console.error(
        `Session ${sessionId} not found in database for userId ${userId}`
      );
      return res.status(404).json({ error: "Session not found" });
    }
    // Recreate session
    try {
      const {
        sessionId: newSessionId,
        browser,
        page,
        qrCode,
      } = await launchWhatsAppSession(wsClients, redis);
      await prisma.whatsAppSessions.update({
        where: { id: dbSession.id },
        data: { sessionId: newSessionId, botStepStatus: "QRCODE" },
      });
      await redis.set(
        `whatsapp:session:${newSessionId}`,
        JSON.stringify({
          sessionId: newSessionId,
          userId,
          botStepStatus: "QRCODE",
        }),
        "EX",
        3600
      );
      console.log(
        `Recreated session ${newSessionId} for userId ${userId}, QR code:`,
        qrCode.substring(0, 50) + "..."
      );
      await browser.close();
      res.status(200).json({ sessionId: newSessionId, qrCode });
    } catch (error) {
      console.error(
        `Session recreation failed for userId ${userId}, sessionId ${sessionId}:`,
        error
      );
      res.status(500).json({ error: "Session recreation failed" });
    }
    return;
  }

  try {
    const { browser, page } = await launchWhatsAppSession(
      wsClients,
      redis,
      sessionId
    );
    const qrCode = await refreshWhatsAppPage(page);
    console.log(
      `Refreshed QR code for session ${sessionId}:`,
      qrCode.substring(0, 50) + "..."
    );
    await browser.close();
    res.status(200).json({ sessionId, qrCode });
  } catch (error) {
    console.error(
      `QR code refresh failed for sessionId ${sessionId}, userId ${userId}:`,
      error
    );
    res.status(500).json({ error: "QR code refresh failed" });
  }
};

export const getSession = async (
  req: Request,
  res: Response,
  wsClients: Map<string, WebSocket>,
  redis: Redis
) => {
  const { id } = req.params;
  const userId = req.user?.id;
  if (!userId || !id) {
    console.error("Missing userId or sessionId in get session request");
    return res.status(401).json({ error: "Unauthorized or missing sessionId" });
  }

  try {
    const session = await prisma.whatsAppSessions.findUnique({
      where: { sessionId: id, userId },
    });
    if (!session) {
      console.error(`Session ${id} not found for userId ${userId}`);
      return res.status(404).json({ error: "Session not found" });
    }

    let chats: { id: string; name: string; image: string }[] = [];
    if (session.botStepStatus === "AUTHENTICATED") {
      const { browser, page } = await launchWhatsAppSession(
        wsClients,
        redis,
        id
      );
      try {
        await page.waitForSelector(
          "#pane-side > div:nth-child(2) > div > div",
          { timeout: 10000 }
        );
        chats = await page.evaluate(() => {
          const chatElements = document.querySelectorAll(
            "#pane-side > div:nth-child(2) > div > div > div.x10l6tqk.xh8yej3.x1g42fcv[role='listitem']"
          );
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
        console.log(`Fetched ${chats.length} chats for session ${id}`);
      } catch (error: any) {
        console.error(`Failed to fetch chats for session ${id}:`, error);
      } finally {
        await browser.close();
      }
    }

    res.status(200).json({ session, chats });
  } catch (error) {
    console.error(`Failed to fetch session ${id} for userId ${userId}:`, error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
};
