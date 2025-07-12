import express, { Express } from "express";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import v1Routes from "./api/v1";
import Redis from "ioredis";
import {
  launchWhatsAppSession,
  cleanupSession,
} from "./puppeteer/sessionLauncher";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

const wsClients = new Map<string, Set<WebSocket>>();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket client connected");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { sessionId } = data;
      if (sessionId) {
        if (!wsClients.has(sessionId)) wsClients.set(sessionId, new Set());
        wsClients.get(sessionId)!.add(ws);
        console.log(`Registered WebSocket for session: ${sessionId}`);

        const sessionData = await redis.get(`whatsapp:session:${sessionId}`);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.botStepStatus === "AUTHENTICATED") {
            const { browser, page } = await launchWhatsAppSession(
              wsClients,
              redis,
              sessionId
            );
            try {
              await page.waitForSelector("[role='list']", { timeout: 60000 }); // Increased timeout
              const chats = await page.evaluate(() => {
                const chats = Array.from(
                  document.querySelectorAll("[role='listitem']")
                ).slice(0, 10);
                return chats.map((element, index) => ({
                  id: element.getAttribute("data-id") || `chat-${index}`,
                  name:
                    element
                      .querySelector("span[title]")
                      ?.getAttribute("title") || "Unknown",
                  image:
                    element.querySelector("img")?.src ||
                    "https://placehold.co/600x400",
                }));
              });
              wsClients.get(sessionId)?.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(
                    JSON.stringify({
                      sessionId,
                      status: "AUTHENTICATED",
                      message: "Chats loaded",
                      chats,
                    })
                  );
                  console.log(
                    `Sent chats for session ${sessionId}: ${chats.length} chats`
                  );
                }
              });
            } catch (error) {
              console.error(
                `Failed to fetch chats for session ${sessionId}:`,
                error
              );
            }
          }
        }
      }

      if (data.type === "select_chat" && data.sessionId && data.chatId) {
        const { browser, page } = await launchWhatsAppSession(
          wsClients,
          redis,
          data.sessionId
        );
        try {
          const success = await page.evaluate((chatId: string) => {
            const chatElement = document.querySelector(
              `div[data-id="${chatId}"]`
            );
            if (chatElement) {
              (chatElement as HTMLElement).click();
              return true;
            }
            return false;
          }, data.chatId);
          wsClients.get(data.sessionId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "chat_selected",
                  sessionId: data.sessionId,
                  chatId: data.chatId,
                  success,
                  error: success ? undefined : "Chat not found",
                })
              );
            }
          });
          console.log(
            `Chat selection ${success ? "succeeded" : "failed"} for chat ${data.chatId} in session ${data.sessionId}`
          );
        } catch (error) {
          console.error(
            `Failed to select chat ${data.chatId} for session ${data.sessionId}:`,
            error
          );
          wsClients.get(data.sessionId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "chat_selected",
                  sessionId: data.sessionId,
                  chatId: data.chatId,
                  success: false,
                  error: "Failed to click chat",
                })
              );
            }
          });
        }
      }
    } catch (e) {
      console.error("Invalid WS message", e);
    }
  });

  ws.on("close", async () => {
    console.log("WebSocket client disconnected");
    for (const [sessionId, clients] of wsClients.entries()) {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          wsClients.delete(sessionId);
          await cleanupSession(sessionId);
          console.log(
            `Cleaned up session ${sessionId} due to no active clients`
          );
        }
      }
    }
  });
});

app.use("/api/v1", v1Routes(wsClients, redis));

app.get("/", (req, res) => {
  res.status(200).json({ message: "WhatsApp Automation Backend" });
});

process.on("SIGTERM", async () => {
  for (const sessionId of wsClients.keys()) {
    await cleanupSession(sessionId);
  }
  await redis.quit();
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
});

export default app;
