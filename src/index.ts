import express, { Express, Request, Response } from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import v1Routes from "./api/v1";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

// Enable CORS for the frontend origin
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

// Handle preflight OPTIONS requests for all routes
app.options("*", cors());

app.use(express.json());
app.use("/api/v1", v1Routes);

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  ws.on("message", (message) => {
    console.log("Received:", message.toString());
  });
  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

export default app;
