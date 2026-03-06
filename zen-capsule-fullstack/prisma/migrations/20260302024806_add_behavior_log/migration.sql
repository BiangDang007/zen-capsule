-- CreateEnum
CREATE TYPE "AiCategory" AS ENUM ('critical', 'important', 'normal', 'social');

-- CreateEnum
CREATE TYPE "UserAction" AS ENUM ('ALLOWED_THROUGH', 'DISMISSED', 'OVERRODE_AI', 'CONFIRMED_BLOCK', 'MARKED_URGENT', 'MARKED_NOT_URGENT');

-- CreateTable
CREATE TABLE "BehaviorLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "subject" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "isWhitelisted" BOOLEAN NOT NULL DEFAULT false,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "hourOfDay" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "aiScore" INTEGER NOT NULL,
    "aiCategory" "AiCategory" NOT NULL,
    "aiShouldBreak" BOOLEAN NOT NULL,
    "aiReason" TEXT,
    "modelVersion" TEXT NOT NULL DEFAULT 'claude-haiku',
    "userAction" "UserAction",
    "userActionAt" TIMESTAMP(3),
    "focusSessionId" TEXT,
    "focusMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehaviorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehaviorLog_userId_createdAt_idx" ON "BehaviorLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BehaviorLog_aiCategory_userAction_idx" ON "BehaviorLog"("aiCategory", "userAction");

-- AddForeignKey
ALTER TABLE "BehaviorLog" ADD CONSTRAINT "BehaviorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
