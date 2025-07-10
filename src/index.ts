import express, { Express } from "express";
import { WebSocketServer, WebSocket, CloseEvent } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import v1Routes from "./api/v1";
import Redis from "ioredis";
import { launchWhatsAppSession } from "./puppeteer/sessionLauncher";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
});

// Create Map for WebSocket clients
const wsClients = new Map<string, WebSocket>();

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
      if (data.sessionId) {
        wsClients.set(data.sessionId, ws);
        console.log(`Registered WebSocket for session: ${data.sessionId}`);
        // Check Redis for session status
        const sessionData = await redis.get(
          `whatsapp:session:${data.sessionId}`
        );
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.botStepStatus === "AUTHENTICATED") {
            // Recreate Puppeteer instance for chat fetching
            const { browser, page } = await launchWhatsAppSession(
              wsClients,
              redis,
              data.sessionId
            );
            try {
              const chats = await page.evaluate(() => {
                const chats = Array.from(
                  document.querySelectorAll(
                    "#pane-side > div:nth-child(2) > div > div > div.x10l6tqk.xh8yej3.x1g42fcv[role='listitem']"
                  )
                ).slice(0, 10);
                const chatList: { id: string; name: string; image: string }[] =
                  [];
                chats.forEach((element, index) => {
                  const id = element.getAttribute("data-id") || `chat-${index}`;
                  const nameElement = element.querySelector("span[title]");
                  const name = nameElement
                    ? nameElement.getAttribute("title") || "Unknown"
                    : "Unknown";
                  const imageElement = element.querySelector("img");
                  const image = imageElement
                    ? imageElement.src
                    : "https://placehold.co/600x400";
                  chatList.push({ id, name, image });
                });
                return chatList;
              });
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    sessionId: data.sessionId,
                    status: "AUTHENTICATED",
                    message: "Chats loaded",
                    chats,
                  })
                );
                console.log(`Resent chats for session ${data.sessionId}`);
              }
            } finally {
              await browser.close();
            }
          }
        }
      }
      if (data.type === "select_chat" && data.sessionId && data.chatId) {
        const chatId: string = data.chatId;
        const sessionData = await redis.get(
          `whatsapp:session:${data.sessionId}`
        );
        if (!sessionData) {
          console.error(
            `Session ${data.sessionId} not found in Redis for chat selection`
          );
          ws.send(
            JSON.stringify({
              type: "chat_selected",
              sessionId: data.sessionId,
              chatId,
              success: false,
              error: "Session not found",
            })
          );
          return;
        }
        const session = JSON.parse(sessionData);
        const { browser, page } = await launchWhatsAppSession(
          wsClients,
          redis,
          data.sessionId
        );
        try {
          let success = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              success = await page.evaluate((chatId: string) => {
                const chatElement = document.querySelector(
                  `div[data-id="${chatId}"]`
                );
                if (chatElement) {
                  (chatElement as HTMLElement).click();
                  return true;
                }
                return false;
              }, chatId);
              if (success) {
                console.log(
                  `Clicked chat ${chatId} for session ${data.sessionId} on attempt ${attempt}`
                );
                ws.send(
                  JSON.stringify({
                    type: "chat_selected",
                    sessionId: data.sessionId,
                    chatId,
                    success: true,
                  })
                );
                break;
              } else {
                console.warn(
                  `Chat ${chatId} not found for session ${data.sessionId} on attempt ${attempt}`
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            } catch (err: any) {
              console.error(
                `Failed to click chat ${chatId} for session ${data.sessionId} on attempt ${attempt}:`,
                err.message
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          if (!success) {
            console.error(
              `Failed to click chat ${chatId} for session ${data.sessionId} after 3 attempts`
            );
            ws.send(
              JSON.stringify({
                type: "chat_selected",
                sessionId: data.sessionId,
                chatId,
                success: false,
                error: "Chat not found or failed to click",
              })
            );
          }
        } finally {
          await browser.close();
        }
      }
    } catch (e) {
      console.error("Invalid WS message", e);
    }
  });

  ws.on("close", async (event: CloseEvent) => {
    console.log(
      `WebSocket client disconnected: code=${event.code}, reason=${event.reason}`
    );
    for (const [sessionId, client] of wsClients.entries()) {
      if (client === ws) {
        wsClients.delete(sessionId);
        console.log(`Removed WebSocket client for session: ${sessionId}`);
        break;
      }
    }
  });
});

// Mount routes explicitly to avoid invalid paths
app.use("/api/v1", v1Routes(wsClients, redis));

app.get("/", (req, res) => {
  res.status(200).json({ message: "WhatsApp Automation Backend" });
});

// Cleanup Redis connection on server shutdown
process.on("SIGTERM", async () => {
  await redis.quit();
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
});

export default app;
