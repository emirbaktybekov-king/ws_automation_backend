import { Router } from "express";
import type { WebSocket } from "ws";
import { Browser, Page } from "puppeteer";
import authRoutes from "./routes/authRoutes";
import sessionRoutes from "./routes/sessionRoutes";
import healthRoutes from "./routes/healthRoutes";
import webhookRoutes from "./routes/webhookRoutes";

export default function v1Routes(
  wsClients: Map<string, WebSocket>,
  sessions: Map<string, { browser: Browser; page: Page }>
) {
  const router = Router();

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/session", sessionRoutes(wsClients, sessions));
  router.use("/whatsapp_bot", webhookRoutes(wsClients, sessions));

  return router;
}
