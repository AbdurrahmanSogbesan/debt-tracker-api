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
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { JwtGuard } from '../auth/guard';
import { Loan } from '@prisma/client';
import { LoanCreateInputExtended } from './dto/create-individual-loan.dto';
import { GroupService } from '../group/group.service';
import { LoanUpdateDto } from './dto/update-individual-loan.dto';
import { LoanTransferDto } from './dto/transfer-loan.dto';

@UseGuards(JwtGuard)
@Controller('loan')
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly groupService: GroupService,
  ) {}

  @Post()
  async createIndividualLoan(
    @Body() createLoanDto: LoanCreateInputExtended,
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
    @Request() req,
  ): Promise<Loan | null> {
    const { id: supabaseUid } = req.user || {};

    const userId =
      await this.groupService.getUserIdFromSupabaseUid(supabaseUid);

    return await this.loanService.getLoanById(+id, userId);
  }

  @Patch(':id')
  async updateIndividualLoan(
    @Param('id') id: number,
    @Body() updateLoanDto: LoanUpdateDto,
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
}
