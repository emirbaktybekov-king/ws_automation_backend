import { Router } from "express";
import { WebSocket } from "ws";
import Redis from "ioredis";
import {
  createSession,
  refreshSession,
  getSession,
} from "../controllers/sessionController";
import { authMiddleware } from "../middleware/authMiddleware";

export default function sessionRoutes(
  wsClients: Map<string, WebSocket>,
  redis: Redis
) {
  const router = Router();

  router.post("/create", authMiddleware, (req, res) =>
    createSession(req, res, wsClients, redis)
  );
  router.post("/refresh", authMiddleware, (req, res) =>
    refreshSession(req, res, wsClients, redis)
  );
  router.get("/:id", authMiddleware, (req, res) =>
    getSession(req, res, wsClients, redis)
  );

  return router;
}
