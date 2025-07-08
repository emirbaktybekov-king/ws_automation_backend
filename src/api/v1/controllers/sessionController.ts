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
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Check for existing sessions for the user
    const existingSession = await prisma.whatsAppSessions.findFirst({
      where: { userId, botStepStatus: "QRCODE" },
    });

    if (existingSession) {
      const activeSession = sessions.get(existingSession.sessionId);
      if (activeSession) {
        await activeSession.browser.close();
        sessions.delete(existingSession.sessionId);
      }
      await prisma.whatsAppSessions.delete({
        where: { id: existingSession.id },
      });
    }

    const { sessionId, browser, page, qrCode } = await launchWhatsAppSession();
    console.log("Sending QR code to client:", qrCode.substring(0, 50) + "..."); // Debug log
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
    console.error("Session creation failed:", error);
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
    return res.status(401).json({ error: "Unauthorized or missing sessionId" });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    const qrCode = await refreshWhatsAppPage(session.page);
    console.log("Sending refreshed QR code:", qrCode.substring(0, 50) + "...");
    res.status(200).json({ sessionId, qrCode });
  } catch (error) {
    console.error("QR code refresh failed:", error);
    res.status(500).json({ error: "QR code refresh failed" });
  }
};
