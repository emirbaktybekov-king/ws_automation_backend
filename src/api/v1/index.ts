import { Router } from "express";
import type { WebSocket as WsWebSocket } from "ws";
import authRoutes from "./routes/authRoutes";
import sessionRoutes from "./routes/sessionRoutes";

export default function v1Routes(wsClients: Map<string, WsWebSocket>) {
  const router = Router();

  router.use("/auth", authRoutes);

  // Предполагаем, что sessionRoutes — это функция, принимающая wsClients и возвращающая Router
  router.use("/session", sessionRoutes(wsClients));

  return router;
}
