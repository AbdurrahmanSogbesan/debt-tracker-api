/*
  Warnings:

  - You are about to drop the column `createdByUuid` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `borrowerUuid` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `groupUuid` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `lenderUuid` on the `Loan` table. All the data in the column will be lost.
  - The primary key for the `Member` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `groupUuid` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `userUuid` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `groupUuid` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `paidByUuid` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `transactionUuid` on the `TransactionSplit` table. All the data in the column will be lost.
  - You are about to drop the column `userUuid` on the `TransactionSplit` table. All the data in the column will be lost.
  - Added the required column `creatorId` to the `Group` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Group` table without a default value. This is not possible if the table is not empty.
  - Added the required column `borrowerId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groupId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lenderId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groupId` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groupId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payerId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transactionId` to the `TransactionSplit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `TransactionSplit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_DUE', 'LOAN_REMINDER', 'EXPENSE_ADDED', 'BALANCE_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationFormat" AS ENUM ('EMAIL_NOTIFICATION', 'PUSH_NOTIFICATION');

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_createdByUuid_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_borrowerUuid_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_groupUuid_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_lenderUuid_fkey";

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_groupUuid_fkey";

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_userUuid_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_groupUuid_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_paidByUuid_fkey";

-- DropForeignKey
ALTER TABLE "TransactionSplit" DROP CONSTRAINT "TransactionSplit_transactionUuid_fkey";

-- DropForeignKey
ALTER TABLE "TransactionSplit" DROP CONSTRAINT "TransactionSplit_userUuid_fkey";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "createdByUuid",
ADD COLUMN     "creatorId" INTEGER NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "borrowerUuid",
DROP COLUMN "groupUuid",
DROP COLUMN "lenderUuid",
ADD COLUMN     "borrowerId" INTEGER NOT NULL,
ADD COLUMN     "groupId" INTEGER NOT NULL,
ADD COLUMN     "lenderId" INTEGER NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Member" DROP CONSTRAINT "Member_pkey",
DROP COLUMN "groupUuid",
DROP COLUMN "id",
DROP COLUMN "userUuid",
ADD COLUMN     "groupId" INTEGER NOT NULL,
ADD COLUMN     "role" "GroupRole" NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "Member_pkey" PRIMARY KEY ("groupId", "userId");

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "groupUuid",
DROP COLUMN "paidByUuid",
ADD COLUMN     "groupId" INTEGER NOT NULL,
ADD COLUMN     "payerId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "TransactionSplit" DROP COLUMN "transactionUuid",
DROP COLUMN "userUuid",
ADD COLUMN     "transactionId" INTEGER NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "notificationFormat" "NotificationFormat" NOT NULL DEFAULT 'PUSH_NOTIFICATION',
    "paymentDue" BOOLEAN NOT NULL DEFAULT true,
    "loanReminder" BOOLEAN NOT NULL DEFAULT true,
    "expenseAdded" BOOLEAN NOT NULL DEFAULT true,
    "balanceUpdate" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_uuid_key" ON "Notification"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_uuid_key" ON "NotificationPreference"("uuid");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
