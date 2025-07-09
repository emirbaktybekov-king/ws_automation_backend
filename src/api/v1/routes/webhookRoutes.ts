import { Router } from "express";
import type { WebSocket } from "ws";
import { Browser, Page } from "puppeteer";

const router = Router();

// List of 10 realistic Russian captions for image messages
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

export default function webhookRoutes(
  wsClients: Map<string, WebSocket>,
  sessions: Map<string, { browser: Browser; page: Page }>
) {
  // GET /api/v1/whatsapp_bot/webhook
  router.get("/webhook", async (req, res) => {
    try {
      // Select random caption and thumbnail URL
      const randomCaption =
        captions[Math.floor(Math.random() * captions.length)];
      const randomThumbnail =
        thumbnailUrls[Math.floor(Math.random() * thumbnailUrls.length)];
      const response = {
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
      console.error("Webhook error:", err);
      res.status(500).json({ error: "Failed to process webhook request" });
    }
  });

  return router;
}
