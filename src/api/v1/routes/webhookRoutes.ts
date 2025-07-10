import { Router } from "express";

// Placeholder data for simulating webhook responses
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

const generateChatId = (): string => {
  const phone = generatePhoneNumber().replace("+", "");
  return `${phone}@c.us`;
};

export default function webhookRoutes() {
  const router = Router();

  // GET /api/v1/whatsapp_bot/webhook (for testing webhook availability)
  router.get("/webhook", async (req, res) => {
    try {
      const randomCaption = captions[Math.floor(Math.random() * captions.length)];
      const randomThumbnail =
        thumbnailUrls[Math.floor(Math.random() * thumbnailUrls.length)];
      const response = {
        status: "ok",
        message: "WhatsApp Webhook test endpoint is active",
        timestamp: new Date().toISOString(),
        endpoint: "/api/v1/whatsapp_bot/webhook",
        sampleResponse: {
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
        },
      };
      res.status(200).json(response);
    } catch (err: any) {
      console.error("Webhook GET error:", err);
      res.status(200).json({
        status: "received",
        processed: true,
        error: "Error caught, but message acknowledged",
      });
    }
  });

  // POST /api/v1/whatsapp_bot/webhook/:instanceIndex (for testing GreenAPI-like webhook events)
  router.post("/webhook/:instanceIndex", async (req, res) => {
    const { instanceIndex } = req.params;
    const webhookData = req.body;

    try {
      // Validate instanceIndex
      const instanceNum = parseInt(instanceIndex);
      if (isNaN(instanceNum) || instanceNum < 1 || instanceNum > 4) {
        console.error(`Invalid instanceIndex: ${instanceIndex}`);
        return res.status(200).json({
          status: "received",
          processed: false,
          error: "Invalid instance index",
          instance: instanceIndex,
        });
      }

      // Validate webhook payload
      if (!webhookData.typeWebhook || !webhookData.senderData?.chatId) {
        console.error("Invalid webhook payload:", webhookData);
        return res.status(200).json({
          status: "received",
          processed: false,
          error: "Invalid webhook payload",
          instance: instanceIndex,
        });
      }

      // Log webhook event for testing (no WebSocket/Redis)
      console.log(`Received test webhook for instance ${instanceIndex}:`, webhookData);

      res.status(200).json({
        status: "received",
        processed: true,
        instance: instanceIndex,
      });
    } catch (err: any) {
      console.error(`Webhook POST error for instance ${instanceIndex}:`, err);
      res.status(200).json({
        status: "received",
        processed: true,
        error: "Error caught, but message acknowledged",
        instance: instanceIndex,
      });
    }
  });

  return router;
}