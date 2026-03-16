-- CreateEnum
CREATE TYPE "SenderRelationship" AS ENUM ('boss', 'client', 'family', 'friend', 'coworker', 'other');

-- CreateEnum
CREATE TYPE "AppRuleAction" AS ENUM ('always_block', 'always_allow', 'ask_ai');

-- AlterTable
ALTER TABLE "Whitelist" ADD COLUMN     "relationship" "SenderRelationship" NOT NULL DEFAULT 'other';

-- CreateTable
CREATE TABLE "AppRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "packageName" TEXT,
    "action" "AppRuleAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppRule_userId_appName_key" ON "AppRule"("userId", "appName");

-- AddForeignKey
ALTER TABLE "AppRule" ADD CONSTRAINT "AppRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
