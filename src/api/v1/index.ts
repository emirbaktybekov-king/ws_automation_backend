import { Router } from "express";
import { WebSocket } from "ws";
import Redis from "ioredis";
import authRoutes from "./routes/authRoutes";
import sessionRoutes from "./routes/sessionRoutes";
import healthRoutes from "./routes/healthRoutes";
import webhookRoutes from "./routes/webhookRoutes";

export default function v1Routes(
  wsClients: Map<string, Set<WebSocket>>,
  redis: Redis
) {
  const router = Router();

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/session", sessionRoutes(wsClients, redis));
  router.use("/whatsapp_bot", webhookRoutes());

  return router;
}
