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

@UseGuards(JwtGuard)
@Controller('loan')
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly groupService: GroupService,
  ) {}

  @Post()
  async createIndividualLoan(
    @Body() createLoanDto: LoanCreateInput,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    const borrower = await this.loanService.getUserByEmail(
      createLoanDto.borrower,
    );
    return await this.loanService.createLoan(
      createLoanDto,
      userId,
      borrower.id,
    );
  }

  @Get(':id')
  async getLoanById(
    @Param('id') id: number,
    @Query('type') type: 'single' | 'split' = 'single',
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    return await this.loanService.getLoanDetails(+id, type);
  }

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

  @Patch(':id/transfer')
  async transferLoan(
    @Param('id') id: number,
    @Body() loanTransferDto: LoanTransferDto,
    @Request() req,
  ): Promise<Loan> {
    const { id: supabaseUid } = req.user || {};
    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    const borrower = await this.loanService.getUserByEmail(
      loanTransferDto.newBorrowerEmail,
    );
    return await this.loanService.transferLoan(+id, borrower.id, userId);
  }

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

  // Split Loan Operations
  @Post('splits') // Changed from 'splits' for consistency
  async createSplitLoan(
    @Body() createSplitLoanDto: CreateSplitLoanRequest,
    @Request() req,
  ): Promise<Loan | { parent: Loan; splits: Loan[] }> {
    const { id: supabaseUid } = req.user || {};
    const creatorId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);
    console.log('CREATOR ----> ', creatorId);
    console.log(createSplitLoanDto);
    const emails = createSplitLoanDto.memberSplits.map((split) => split.email);
    console.log('EMAILS ----> ', emails);
    const userIds = await this.loanService.getUserIdsFromEmails(emails);
    console.log('USERIDs ----> ', userIds);
    const memberSplits: UserIdMemberSplit[] =
      createSplitLoanDto.memberSplits.map((split, index) => ({
        userId: userIds[index],
        amount: split.amount,
        status: split.status,
      }));
    console.log('MEMBERSPLITS ---->', memberSplits);
    return await this.loanService.createSplitLoan(
      {
        ...createSplitLoanDto,
        memberSplits,
      },
      creatorId,
    );
  }

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
    const userIds = await this.loanService.getUserIdsFromEmails(emails);
    const memberSplits: UserIdMemberSplit[] =
      updateSplitLoanDto.memberSplits.map((split, index) => ({
        userId: userIds[index],
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
}
