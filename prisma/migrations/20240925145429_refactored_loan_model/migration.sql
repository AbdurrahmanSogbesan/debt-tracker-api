/*
  Warnings:

  - Added the required column `amount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL;
