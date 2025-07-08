import { Router } from "express";
import {
  createSession,
  refreshSession,
} from "../controllers/sessionController";
import { authMiddleware } from "../middleware/authMiddleware";
import type { WebSocket } from "ws";

export default function sessionRoutes(wsClients: Map<string, WebSocket>) {
  const router = Router();

  router.post("/create", authMiddleware, (req, res) =>
    createSession(req, res, wsClients)
  );
  router.post("/refresh", authMiddleware, (req, res) =>
    refreshSession(req, res, wsClients)
  );

  return router;
}
