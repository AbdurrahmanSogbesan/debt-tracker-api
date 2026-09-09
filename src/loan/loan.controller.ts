import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Patch,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { JwtGuard, RegisteredUserGuard } from '../auth/guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { Loan } from '@prisma/client';
import { CreateLoanDto } from './dto/create-individual-loan.dto';
import { UpdateIndividualLoanDto } from './dto/update-individual-loan.dto';
import { LoanTransferDto } from './dto/transfer-loan.dto';
import {
  CreateSplitLoanRequest,
  UserIdMemberSplit,
} from './dto/create-split-loan.dto';
import { UpdateSplitLoanRequest } from './dto/update-split-loan.dto';
import { GetChildLoansDto } from './dto/get-child-loans.dto';

@Controller('loan')
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Post()
  async createIndividualLoan(
    @Body() createLoanDto: CreateLoanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    let otherPartyId: number | null = null;
    let otherPartyEmail: string | null = null;

    if (createLoanDto.otherPartyEmail) {
      otherPartyEmail = createLoanDto.otherPartyEmail;

      try {
        const otherParty =
          await this.loanService.getUserByEmail(otherPartyEmail);
        if (otherParty) {
          otherPartyId = otherParty.id;
          otherPartyEmail = null;
        }
      } catch (error) {}
    } else if (createLoanDto.borrower) {
      try {
        const borrower = await this.loanService.getUserByEmail(
          createLoanDto.borrower,
        );
        otherPartyId = borrower?.id || null;

        if (!otherPartyId) {
          otherPartyEmail = createLoanDto.borrower;
        }
      } catch (error) {
        otherPartyEmail = createLoanDto.borrower;
      }
    }

    if (!otherPartyId && createLoanDto.groupId) {
      throw new BadRequestException(
        'Cannot link a loan to a group when the other party is not a registered user',
      );
    }

    return await this.loanService.createLoan(
      createLoanDto,
      user.userId,
      otherPartyId,
      otherPartyEmail,
    );
  }

  @Get('reminders')
  async triggerLoanReminders() {
    await this.loanService.handleLoanReminders();
    return { message: 'Loan reminders processed successfully' };
  }

  @Get('overdue')
  async triggerOverdueLoans() {
    await this.loanService.handleOverdueLoans();
    return { message: 'Overdue loans processed successfully' };
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Get(':id')
  async getLoanById(
    @Param('id') id: number,
    @CurrentUser() user: AuthUser,
    @Query('type') type: 'single' | 'split' = 'single',
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    return await this.loanService.getLoanDetails(+id, user.userId, type);
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':id')
  async updateIndividualLoan(
    @Param('id') id: number,
    @Body() updateLoanDto: UpdateIndividualLoanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    return await this.loanService.updateLoan(+id, updateLoanDto, user.userId);
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':id/transfer')
  async transferLoan(
    @Param('id') id: number,
    @Body() loanTransferDto: LoanTransferDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    let borrowerId: number | undefined;

    if (loanTransferDto.newBorrowerEmail) {
      const borrower = await this.loanService.getUserByEmail(
        loanTransferDto.newBorrowerEmail,
      );
      borrowerId = borrower?.id;
    }

    return await this.loanService.transferLoan(
      +id,
      user.userId,
      borrowerId,
      loanTransferDto.newPartyEmail,
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':id/delete')
  async deleteIndividualLoan(
    @Param('id') id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    return await this.loanService.deleteLoan(+id, user.userId);
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Post('splits')
  async createSplitLoan(
    @Body() createSplitLoanDto: CreateSplitLoanRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    const emails = createSplitLoanDto.memberSplits.map((split) => split.email);
    const userIdsByEmail = await this.loanService.getUserIdsFromEmails(emails);
    const memberSplits: UserIdMemberSplit[] =
      createSplitLoanDto.memberSplits.map((split) => ({
        userId: userIdsByEmail[split.email],
        amount: split.amount,
        status: split.status,
      }));
    return await this.loanService.createSplitLoan(
      {
        ...createSplitLoanDto,
        memberSplits,
      },
      user.userId,
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':id/splits')
  async updateSplitLoan(
    @Param('id') id: string,
    @Body() updateSplitLoanDto: UpdateSplitLoanRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    const emails = updateSplitLoanDto.memberSplits.map((split) => split.email);
    const userIdsByEmail = await this.loanService.getUserIdsFromEmails(emails);
    const memberSplits: UserIdMemberSplit[] =
      updateSplitLoanDto.memberSplits.map((split) => ({
        userId: userIdsByEmail[split.email],
        amount: split.amount,
        status: split.status,
      }));

    return await this.loanService.updateSplitLoan(
      Number(id),
      {
        ...updateSplitLoanDto,
        memberSplits,
      },
      user.userId,
    );
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Patch(':id/splits/delete')
  async deleteSplitLoan(
    @Param('id') id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<Loan> {
    return await this.loanService.deleteSplitLoan(+id, user.userId);
  }

  @UseGuards(JwtGuard, RegisteredUserGuard)
  @Get(':parentId/child-loans')
  async getChildLoans(
    @Param('parentId') parentId: number,
    @CurrentUser() user: AuthUser,
    @Query() dto: GetChildLoansDto,
  ): Promise<{
    childLoans: any[];
    totalAmount: number;
    count: number;
  }> {
    return this.loanService.getChildLoans(+parentId, user.userId, dto);
  }
}
