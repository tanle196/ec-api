import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import {
  AdminPaymentPaginatedResponseDto,
  AdminPaymentResponseDto,
} from './dto/admin-payment-response.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Admin: payments')
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions('payment.read')
  @ApiOperation({ summary: 'Admin: list all payments' })
  @ApiOkResponse({ type: AdminPaymentPaginatedResponseDto })
  findAll(
    @Query() query: PaymentQueryDto,
  ): Promise<AdminPaymentPaginatedResponseDto> {
    return this.paymentsService.findAll(query, undefined, true);
  }

  @Get(':id')
  @Permissions('payment.read')
  @ApiOperation({ summary: 'Admin: get payment detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminPaymentResponseDto })
  findOne(@Param('id') id: string): Promise<AdminPaymentResponseDto> {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id/status')
  @Permissions('payment.update')
  @ApiOperation({ summary: 'Admin: update payment status' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminPaymentResponseDto })
  updateStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<AdminPaymentResponseDto> {
    return this.paymentsService.updateStatus(id, dto, user.id);
  }
}
