import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CodSettlementDto } from './dto/cod-settlement.dto';
import {
  CodSettlementResponseDto,
  PaymentIssuePaginatedResponseDto,
  PaymentIssueResponseDto,
  ReconciliationResponseDto,
} from './dto/payment-operations-response.dto';
import { PaymentIssueQueryDto } from './dto/payment-issue-query.dto';
import { ResolvePaymentIssueDto } from './dto/resolve-payment-issue.dto';
import { PaymentIssuesService } from './payment-issues.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentsService } from './payments.service';

// Kept off /admin/payments so these paths can't collide with its /:id routes.
@ApiTags('Admin: payment operations')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminPaymentOperationsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly issuesService: PaymentIssuesService,
    private readonly reconciliationService: PaymentReconciliationService,
  ) {}

  @Get('payment-issues')
  @Permissions('payment.read')
  @ApiOperation({
    summary: 'Admin: payment issues raised by reconciliation and settlement',
  })
  @ApiOkResponse({ type: PaymentIssuePaginatedResponseDto })
  findIssues(
    @Query() query: PaymentIssueQueryDto,
  ): Promise<PaymentIssuePaginatedResponseDto> {
    return this.issuesService.findAll(query);
  }

  @Post('payment-issues/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Permissions('payment.update')
  @ApiOperation({ summary: 'Admin: mark a payment issue as handled' })
  @ApiOkResponse({ type: PaymentIssueResponseDto })
  resolveIssue(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePaymentIssueDto,
  ): Promise<PaymentIssueResponseDto> {
    return this.issuesService.resolve(id, user.id!, dto.note);
  }

  @Post('cod-settlements')
  @HttpCode(HttpStatus.OK)
  @Permissions('payment.update')
  @ApiOperation({
    summary:
      "Admin: book a carrier's COD remittance; matching lines are marked paid",
  })
  @ApiOkResponse({ type: CodSettlementResponseDto })
  settleCod(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CodSettlementDto,
  ): Promise<CodSettlementResponseDto> {
    return this.paymentsService.settleCod(dto, user.id!);
  }

  @Post('payment-reconciliations')
  @HttpCode(HttpStatus.OK)
  @Permissions('payment.update')
  @ApiOperation({ summary: 'Admin: run gateway reconciliation now' })
  @ApiOkResponse({ type: ReconciliationResponseDto })
  async reconcile(): Promise<ReconciliationResponseDto> {
    const summary = await this.reconciliationService.run();
    return summary
      ? { ran: true, ...summary }
      : { ran: false, healed: 0, failed: 0, verified: 0, issues: 0, errors: 0 };
  }
}
