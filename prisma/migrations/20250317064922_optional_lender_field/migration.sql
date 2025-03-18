-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_lenderId_fkey";

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "lenderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
