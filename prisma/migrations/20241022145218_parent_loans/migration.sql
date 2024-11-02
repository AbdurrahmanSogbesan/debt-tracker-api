/*
  Warnings:

  - You are about to drop the `TransactionSplit` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TransactionSplit" DROP CONSTRAINT "TransactionSplit_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionSplit" DROP CONSTRAINT "TransactionSplit_userId_fkey";

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "parentId" INTEGER;

-- DropTable
DROP TABLE "TransactionSplit";

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
