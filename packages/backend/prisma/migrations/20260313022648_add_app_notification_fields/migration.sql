-- AlterEnum
ALTER TYPE "AiCategory" ADD VALUE 'ads';

-- AlterTable
ALTER TABLE "BehaviorLog" ADD COLUMN     "appName" TEXT,
ADD COLUMN     "packageName" TEXT;
