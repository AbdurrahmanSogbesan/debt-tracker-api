/*
  Warnings:

  - You are about to drop the column `transactionId` on the `Loan` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[lenderTransactionId]` on the table `Loan` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[borrowerTransactionId]` on the table `Loan` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `borrowerTransactionId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lenderTransactionId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_transactionId_fkey";

-- DropIndex
DROP INDEX "Loan_transactionId_key";

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "transactionId",
ADD COLUMN     "borrowerTransactionId" INTEGER NOT NULL,
ADD COLUMN     "lenderTransactionId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "title" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Loan_lenderTransactionId_key" ON "Loan"("lenderTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_borrowerTransactionId_key" ON "Loan"("borrowerTransactionId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_lenderTransactionId_fkey" FOREIGN KEY ("lenderTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerTransactionId_fkey" FOREIGN KEY ("borrowerTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
