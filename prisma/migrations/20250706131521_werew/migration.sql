-- CreateEnum
CREATE TYPE "BotStepStatus" AS ENUM ('QRCODE', 'AUTHENTICATED');

-- AlterTable
ALTER TABLE "WhatsAppSessions" ADD COLUMN     "botStepStatus" "BotStepStatus" NOT NULL DEFAULT 'QRCODE';
