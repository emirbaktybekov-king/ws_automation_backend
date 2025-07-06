import { Request, Response } from "express";
import { WebSocket } from "ws";
import prisma from "@/lib/prismaClient";
import { launchWhatsAppSession } from "@/puppeteer/sessionLauncher";

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
    const { sessionId, qrCode } = await launchWhatsAppSession();
    console.log("Sending QR code to client:", qrCode.substring(0, 50) + "..."); // Debug log
    const session = await prisma.whatsAppSessions.create({
      data: {
        userId,
        sessionId,
        botStepStatus: "QRCODE",
      },
    });
    res.status(201).json({ sessionId: session.sessionId, qrCode });
  } catch (error) {
    console.error("Session creation failed:", error);
    res.status(500).json({ error: "Session creation failed" });
  }
};
