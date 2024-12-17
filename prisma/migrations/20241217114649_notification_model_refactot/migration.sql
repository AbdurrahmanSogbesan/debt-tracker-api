/*
  Warnings:

  - The values [PAYMENT_DUE,EXPENSE_ADDED] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('LOAN_CREATED', 'LOAN_REMINDER', 'BALANCE_UPDATE', 'OVERDUE_ALERT', 'LOAN_REPAID', 'INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'GROUP_ROLE_UPDATED', 'GROUP_DELETED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "groupId" INTEGER,
ADD COLUMN     "inviteId" INTEGER,
ADD COLUMN     "loanId" INTEGER,
ADD COLUMN     "payload" JSONB,
ALTER COLUMN "isRead" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
