/*
  Warnings:

  - You are about to drop the column `borrowerTransactionId` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `lenderTransactionId` on the `Loan` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_borrowerTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_lenderTransactionId_fkey";

-- DropIndex
DROP INDEX "Loan_borrowerTransactionId_key";

-- DropIndex
DROP INDEX "Loan_lenderTransactionId_key";

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "borrowerTransactionId",
DROP COLUMN "lenderTransactionId";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "loanId" INTEGER;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
