-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_groupId_fkey";

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "groupId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
