import express, { Express } from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import v1Routes from "./api/v1";

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

// Создаём Map для хранения клиентов WS с правильным типом
import type { WebSocket as WsWebSocket } from "ws";
const wsClients = new Map<string, WsWebSocket>();

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WsWebSocket) => {
  console.log("WebSocket client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.sessionId) {
        wsClients.set(data.sessionId, ws);
        console.log(`Registered WebSocket for session: ${data.sessionId}`);
      }
    } catch (e) {
      console.error("Invalid WS message", e);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    for (const [sessionId, client] of wsClients.entries()) {
      if (client === ws) {
        wsClients.delete(sessionId);
        break;
      }
    }
  });
});

// Используем функцию для создания роутов, передаём wsClients
app.use("/api/v1", v1Routes(wsClients));

export default app;
