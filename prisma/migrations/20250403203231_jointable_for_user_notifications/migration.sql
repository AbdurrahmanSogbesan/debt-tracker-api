/*
  Warnings:

  - You are about to drop the column `isRead` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the `_NotificationToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_NotificationToUser" DROP CONSTRAINT "_NotificationToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "_NotificationToUser" DROP CONSTRAINT "_NotificationToUser_B_fkey";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "isRead";

-- DropTable
DROP TABLE "_NotificationToUser";

-- CreateTable
CREATE TABLE "UserNotification" (
    "userId" INTEGER NOT NULL,
    "notificationId" INTEGER NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("userId","notificationId")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_idx" ON "UserNotification"("userId");

-- CreateIndex
CREATE INDEX "UserNotification_notificationId_idx" ON "UserNotification"("notificationId");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
