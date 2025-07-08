import express, { Express } from "express";
import { WebSocketServer, WebSocket, CloseEvent } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import v1Routes from "./api/v1";
import { Browser, Page } from "puppeteer";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

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

app.options("*", cors());

app.use(express.json());

// Create Map for storing WebSocket clients and Puppeteer sessions
const wsClients = new Map<string, WebSocket>();
const sessions = new Map<string, { browser: Browser; page: Page }>();

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.sessionId) {
        wsClients.set(data.sessionId, ws);
        console.log(`Registered WebSocket for session: ${data.sessionId}`);
        // Resend pending messages for the session
        const session = sessions.get(data.sessionId);
        if (session && data.sessionId) {
          session.page
            .evaluate(() => {
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
            })
            .then((chats) => {
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
            })
            .catch((err) => {
              console.error(
                `Failed to resend chats for session ${data.sessionId}:`,
                err
              );
            });
        }
      }
      if (data.type === "select_chat" && data.sessionId && data.chatId) {
        const chatId: string = data.chatId;
        const session = sessions.get(data.sessionId);
        if (session) {
          session.page
            .evaluate((chatId: string) => {
              const chatElement = document.querySelector(
                `div[data-id="${chatId}"]`
              );
              if (chatElement) {
                (chatElement as HTMLElement).click();
                return true;
              }
              return false;
            }, chatId)
            .then((success: boolean) => {
              if (success) {
                console.log(
                  `Clicked chat ${chatId} for session ${data.sessionId}`
                );
                ws.send(
                  JSON.stringify({
                    type: "chat_selected",
                    sessionId: data.sessionId,
                    chatId,
                    success: true,
                  })
                );
              } else {
                console.error(
                  `Chat ${chatId} not found for session ${data.sessionId}`
                );
                ws.send(
                  JSON.stringify({
                    type: "chat_selected",
                    sessionId: data.sessionId,
                    chatId,
                    success: false,
                  })
                );
              }
            })
            .catch((err: any) => {
              console.error(
                `Failed to click chat ${chatId} for session ${data.sessionId}:`,
                err
              );
              ws.send(
                JSON.stringify({
                  type: "chat_selected",
                  sessionId: data.sessionId,
                  chatId,
                  success: false,
                })
              );
            });
        } else {
          console.error(
            `Session ${data.sessionId} not found for chat selection`
          );
          ws.send(
            JSON.stringify({
              type: "chat_selected",
              sessionId: data.sessionId,
              chatId,
              success: false,
            })
          );
        }
      }
    } catch (e) {
      console.error("Invalid WS message", e);
    }
  });

  ws.on("close", (event: CloseEvent) => {
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

// Pass wsClients and sessions to routes
app.use("/api/v1", v1Routes(wsClients, sessions));

export default app;
