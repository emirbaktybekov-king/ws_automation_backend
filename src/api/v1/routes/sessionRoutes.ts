import { Router } from "express";
import { WebSocket } from "ws";
import { Browser, Page } from "puppeteer";
import { createSession, refreshSession, getSession } from "../controllers/sessionController";
import { authMiddleware } from "../middleware/authMiddleware";

export default function sessionRoutes(wsClients: Map<string, WebSocket>, sessions: Map<string, { browser: Browser; page: Page }>) {
  const router = Router();

  router.post("/create", authMiddleware, (req, res) =>
    createSession(req, res, wsClients)
  );
  router.post("/refresh", authMiddleware, (req, res) =>
    refreshSession(req, res, wsClients)
  );
  router.get("/:id", authMiddleware, (req, res) =>
    getSession(req, res)
  );

  return router;
}