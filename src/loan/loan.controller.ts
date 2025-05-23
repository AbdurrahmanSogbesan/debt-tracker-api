import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  Get,
  Param,
  Patch,
  Query,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { JwtGuard } from '../auth/guard';
import { Loan } from '@prisma/client';
import { LoanCreateInput } from './dto/create-individual-loan.dto';
import { GroupService } from '../group/group.service';
import { UpdateIndividualLoanDto } from './dto/update-individual-loan.dto';
import { LoanTransferDto } from './dto/transfer-loan.dto';
import {
  CreateSplitLoanRequest,
  UserIdMemberSplit,
  CreateSplitLoanDto,
} from './dto/create-split-loan.dto';
import { UpdateSplitLoanRequest } from './dto/update-split-loan.dto';
import { GetChildLoansDto } from './dto/get-child-loans.dto';

@Controller('loan')
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly groupService: GroupService,
  ) {}

  @UseGuards(JwtGuard)
  @Post()
  async createIndividualLoan(
    @Body() createLoanDto: LoanCreateInput & { otherPartyEmail?: string },
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

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
      userId,
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

  @UseGuards(JwtGuard)
  @Get(':id')
  async getLoanById(
    @Param('id') id: number,
    @Query('type') type: 'single' | 'split' = 'single',
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    return await this.loanService.getLoanDetails(+id, type);
  }

  @UseGuards(JwtGuard)
  @Patch(':id')
  async updateIndividualLoan(
    @Param('id') id: number,
    @Body() updateLoanDto: UpdateIndividualLoanDto,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.loanService.updateLoan(+id, updateLoanDto, userId);
  }

  @UseGuards(JwtGuard)
  @Patch(':id/transfer')
  async transferLoan(
    @Param('id') id: number,
    @Body() loanTransferDto: LoanTransferDto,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    let borrowerId: number | undefined;

    if (loanTransferDto.newBorrowerEmail) {
      const borrower = await this.loanService.getUserByEmail(
        loanTransferDto.newBorrowerEmail,
      );
      borrowerId = borrower?.id;
    }

    return await this.loanService.transferLoan(
      +id,
      userId,
      borrowerId,
      loanTransferDto.newPartyEmail,
    );
  }

  @UseGuards(JwtGuard)
  @Patch(':id/delete')
  async deleteIndividualLoan(
    @Param('id') id: number,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.loanService.deleteLoan(+id, userId);
  }

  @UseGuards(JwtGuard)
  @Post('splits')
  async createSplitLoan(
    @Body() createSplitLoanDto: CreateSplitLoanRequest,
    @Request() req,
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    const { id: supabaseUid } = req.user || {};
    const creatorId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
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
      creatorId,
    );
  }

  @UseGuards(JwtGuard)
  @Patch(':id/splits')
  async updateSplitLoan(
    @Param('id') id: string,
    @Body() updateSplitLoanDto: UpdateSplitLoanRequest,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const creatorId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

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
      creatorId,
    );
  }

  @UseGuards(JwtGuard)
  @Patch(':id/splits/delete')
  async deleteSplitLoan(
    @Param('id') id: number,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    return await this.loanService.deleteSplitLoan(+id, userId);
  }

  @UseGuards(JwtGuard)
  @Get(':parentId/child-loans')
  async getChildLoans(
    @Param('parentId') parentId: number,
    @Query() dto: GetChildLoansDto,
  ): Promise<{
    childLoans: any[];
    totalAmount: number;
    count: number;
  }> {
    return this.loanService.getChildLoans(+parentId, dto);
  }
}
