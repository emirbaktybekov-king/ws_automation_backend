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
    const { sessionId, qrCode } = await launchWhatsAppSession((data) => {
      const ws = wsClients.get(data.sessionId);
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({ sessionId: data.sessionId, status: data.status })
        );
      }
      if (data.status === "Connected") {
        prisma.whatsAppSessions
          .update({
            where: { sessionId: data.sessionId },
            data: { botStepStatus: "AUTHENTICATED" },
          })
          .catch((error) =>
            console.error("Failed to update session status:", error)
          );
      }
    });
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
