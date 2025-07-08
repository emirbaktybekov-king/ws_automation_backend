import { Request, Response } from "express";
import { WebSocket } from "ws";
import prisma from "@/lib/prismaClient";
import {
  launchWhatsAppSession,
  refreshWhatsAppPage,
} from "@/puppeteer/sessionLauncher";

// Store active Puppeteer sessions
const sessions = new Map<string, { browser: any; page: any }>();

export const createSession = async (
  req: Request,
  res: Response,
  wsClients: Map<string, WebSocket>
) => {
  const userId = req.user?.id;
  if (!userId) {
    console.error("No userId found in request");
    return res.status(401).json({ error: "Unauthorized: No user ID provided" });
  }

  try {
    // Check for existing QRCODE sessions for the user
    const existingSessions = await prisma.whatsAppSessions.findMany({
      where: { userId, botStepStatus: "QRCODE" },
    });

    // Close and delete all existing QRCODE sessions
    for (const existingSession of existingSessions) {
      const activeSession = sessions.get(existingSession.sessionId);
      if (activeSession) {
        try {
          await activeSession.browser.close();
          console.log(
            `Closed existing browser for session ${existingSession.sessionId}`
          );
        } catch (err) {
          console.error(
            `Failed to close existing browser for session ${existingSession.sessionId}:`,
            err
          );
        }
        sessions.delete(existingSession.sessionId);
      }
      try {
        await prisma.whatsAppSessions.delete({
          where: { id: existingSession.id },
        });
        console.log(
          `Deleted existing session ${existingSession.sessionId} from database`
        );
      } catch (err) {
        console.error(
          `Failed to delete existing session ${existingSession.sessionId} from database:`,
          err
        );
      }
    }

    // Retry logic for session creation
    let sessionData;
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        sessionData = await launchWhatsAppSession(wsClients);
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
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
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
    sessions.set(sessionId, { browser, page });
    res.status(201).json({ sessionId: session.sessionId, qrCode });
  } catch (error) {
    console.error(`Session creation failed for userId ${userId}:`, error);
    res.status(500).json({ error: "Session creation failed" });
  }
};

export const refreshSession = async (
  req: Request,
  res: Response,
  wsClients: Map<string, WebSocket>
) => {
  const { sessionId } = req.body;
  const userId = req.user?.id;
  if (!userId || !sessionId) {
    console.error("Missing userId or sessionId in refresh request");
    return res.status(401).json({ error: "Unauthorized or missing sessionId" });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    // Check if session exists in database
    const dbSession = await prisma.whatsAppSessions.findUnique({
      where: { sessionId },
    });
    if (!dbSession) {
      console.error(
        `Session ${sessionId} not found in database for userId ${userId}`
      );
      return res.status(404).json({ error: "Session not found" });
    }
    // Recreate session if browser was closed
    try {
      const {
        sessionId: newSessionId,
        browser,
        page,
        qrCode,
      } = await launchWhatsAppSession(wsClients);
      sessions.set(newSessionId, { browser, page });
      await prisma.whatsAppSessions.update({
        where: { id: dbSession.id },
        data: { sessionId: newSessionId, botStepStatus: "QRCODE" },
      });
      console.log(
        `Recreated session ${newSessionId} for userId ${userId}, QR code:`,
        qrCode.substring(0, 50) + "..."
      );
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
    const qrCode = await refreshWhatsAppPage(session.page);
    console.log(
      `Refreshed QR code for session ${sessionId}:`,
      qrCode.substring(0, 50) + "..."
    );
    res.status(200).json({ sessionId, qrCode });
  } catch (error) {
    console.error(
      `QR code refresh failed for sessionId ${sessionId}, userId ${userId}:`,
      error
    );
    res.status(500).json({ error: "QR code refresh failed" });
  }
};
