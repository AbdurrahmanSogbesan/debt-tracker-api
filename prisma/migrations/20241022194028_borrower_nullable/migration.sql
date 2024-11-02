-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_borrowerId_fkey";

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "borrowerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
