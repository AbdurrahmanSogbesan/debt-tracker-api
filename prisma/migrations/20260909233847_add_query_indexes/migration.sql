-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE INDEX "Invitation_groupId_status_idx" ON "Invitation"("groupId", "status");

-- CreateIndex
CREATE INDEX "Invitation_userId_status_idx" ON "Invitation"("userId", "status");

-- CreateIndex
CREATE INDEX "Loan_lenderId_isDeleted_idx" ON "Loan"("lenderId", "isDeleted");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_isDeleted_idx" ON "Loan"("borrowerId", "isDeleted");

-- CreateIndex
CREATE INDEX "Loan_groupId_isDeleted_idx" ON "Loan"("groupId", "isDeleted");

-- CreateIndex
CREATE INDEX "Loan_parentId_idx" ON "Loan"("parentId");

-- CreateIndex
CREATE INDEX "Loan_status_dueDate_idx" ON "Loan"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Loan_borrowerEmail_idx" ON "Loan"("borrowerEmail");

-- CreateIndex
CREATE INDEX "Loan_lenderEmail_idx" ON "Loan"("lenderEmail");

-- CreateIndex
CREATE INDEX "Transaction_payerId_date_idx" ON "Transaction"("payerId", "date" DESC);

-- CreateIndex
CREATE INDEX "Transaction_groupId_date_idx" ON "Transaction"("groupId", "date" DESC);

-- CreateIndex
CREATE INDEX "Transaction_loanId_idx" ON "Transaction"("loanId");

-- CreateIndex
CREATE INDEX "Transaction_category_isDeleted_idx" ON "Transaction"("category", "isDeleted");
