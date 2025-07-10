// src/api/v1/routes/webhookRoutes.ts
import { Router, Request, Response, NextFunction } from "express";
import type { WebSocket } from "ws";
import { Browser, Page } from "puppeteer";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file in project root

const router = Router();

// Get API key from environment variable
const API_KEY = "wefweoihnf4ofpojfrwpeojdoih32rewrwee3";

// Middleware to verify Bearer token for POST requests
const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization header missing or invalid" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
};

// List of realistic Russian captions for image messages
const captions = [
  "Вот фото моего заказа #12345, проверьте, пожалуйста!",
  "Это товар, который я получил, он поврежден.",
  "Посмотрите, как выглядит продукт, можно заменить?",
  "Фото чека для возврата заказа #67890.",
  "Вот изображение коробки, не хватает деталей.",
  "Прислал фото товара, это то, что я заказывал?",
  "Сфотографировал дефект на изделии, что делать?",
  "Это фото моего заказа, когда будет доставка?",
  "Проверьте, правильно ли это изделие для меня?",
  "Отправляю фото для подтверждения заказа.",
];

// List of small placeholder image URLs for jpegThumbnail
const thumbnailUrls = [
  "https://placehold.co/50x50",
  "https://picsum.photos/50",
  "https://placehold.co/60x60",
  "https://picsum.photos/60",
  "https://placehold.co/48x48",
  "https://picsum.photos/48",
  "https://placehold.co/64x64",
  "https://picsum.photos/64",
  "https://placehold.co/55x55",
  "https://picsum.photos/55",
];

// Function to generate a random Kyrgyzstan phone number
const generatePhoneNumber = (): string => {
  const prefix = "+996";
  const operator = ["500", "555", "700", "777", "999"][
    Math.floor(Math.random() * 5)
  ];
  const subscriber = Math.floor(1000000 + Math.random() * 9000000)
    .toString()
    .padStart(7, "0");
  return `${prefix}${operator}${subscriber}`;
};

// Function to generate a random chatId in the format [phone]@c.us
const generateChatId = (): string => {
  const phone = generatePhoneNumber().replace("+", "");
  return `${phone}@c.us`;
};

// Function to generate a reply based on message content
const generateReply = (messageData: any): string => {
  const messageType = messageData.typeMessage;
  if (messageType === "imageMessage") {
    const caption = messageData.imageMessageData?.caption?.toLowerCase() || "";
    if (caption.includes("поврежден") || caption.includes("дефект")) {
      return "Спасибо за сообщение. Мы видим, что товар поврежден. Пожалуйста, свяжитесь с нашей службой поддержки для оформления возврата.";
    } else if (caption.includes("чек") || caption.includes("подтверждение")) {
      return "Чек получен. Мы проверим информацию и свяжемся с вами в ближайшее время.";
    } else if (caption.includes("доставка")) {
      return "Спасибо за фото. Мы уточним статус доставки и сообщим вам.";
    } else {
      return "Спасибо за отправку изображения! Мы проверим ваш заказ и свяжемся с вами.";
    }
  } else if (messageType === "textMessage") {
    return "Спасибо за ваше сообщение! Мы обработаем ваш запрос и ответим в ближайшее время.";
  }
  return "Сообщение получено. Мы свяжемся с вами для уточнения деталей.";
};

export default function webhookRoutes(
  wsClients: Map<string, WebSocket>,
  sessions: Map<string, { browser: Browser; page: Page }>
) {
  // GET /api/v1/whatsapp_bot/webhook/:instance (requires api_key in query)
  router.get("/webhook/:instance", async (req: Request, res: Response) => {
    try {
      const instance = req.params.instance;
      const apiKeyFromQuery = req.query.api_key;

      // Check api_key from query string
      if (!apiKeyFromQuery || apiKeyFromQuery !== API_KEY) {
        return res.status(403).json({ error: "Invalid or missing api_key" });
      }

      const randomCaption =
        captions[Math.floor(Math.random() * captions.length)];
      const randomThumbnail =
        thumbnailUrls[Math.floor(Math.random() * thumbnailUrls.length)];

      const response = {
        instance,
        typeWebhook: "incomingMessageReceived",
        messageData: {
          typeMessage: "imageMessage",
          imageMessageData: {
            downloadUrl: "https://url-to-image",
            caption: randomCaption,
            jpegThumbnail: randomThumbnail,
            mimeType: "image/jpeg",
          },
        },
        senderData: {
          chatId: generateChatId(),
        },
      };

      res.status(200).json(response);
    } catch (err: any) {
      console.error(
        `Webhook GET error for instance ${req.params.instance}:`,
        err
      );
      res.status(500).json({ error: "Failed to process webhook GET request" });
    }
  });

  // POST /api/v1/whatsapp_bot/webhook/:instance (requires Bearer token)
  router.post(
    "/webhook/:instance",
    verifyToken,
    async (req: Request, res: Response) => {
      try {
        const instance = req.params.instance;
        const incomingMessage = req.body;

        // Validate incoming message
        if (!incomingMessage || !incomingMessage.messageData) {
          return res.status(400).json({ error: "Invalid message data" });
        }

        // Extract session for the instance
        const session = sessions.get(instance);
        if (!session) {
          return res
            .status(404)
            .json({ error: `Instance ${instance} not found` });
        }

        // Generate a reply based on the incoming message
        const replyMessage = generateReply(incomingMessage.messageData);

        // Send reply via WebSocket
        const ws = wsClients.get(instance);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              instance,
              type: "outgoingMessage",
              message: replyMessage,
              chatId: incomingMessage.senderData?.chatId || generateChatId(),
            })
          );
        } else {
          console.warn(`WebSocket for instance ${instance} not connected`);
        }

        // Respond to the webhook
        res.status(200).json({
          instance,
          status: "received",
          reply: replyMessage,
        });
      } catch (err: any) {
        console.error(
          `Webhook POST error for instance ${req.params.instance}:`,
          err
        );
        res
          .status(500)
          .json({ error: "Failed to process webhook POST request" });
      }
    }
  );

  return router;
}
