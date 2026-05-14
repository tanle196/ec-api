import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import {
  PaymentPaginatedResponseDto,
  PaymentResponseDto,
} from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── User endpoints ────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a payment for an order' })
  @ApiResponse({ status: 201, type: PaymentResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.create(user.id!, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my payments' })
  @ApiOkResponse({ type: PaymentPaginatedResponseDto })
  findMine(
    @CurrentUser() user: ICurrentUser,
    @Query() query: PaymentQueryDto,
  ): Promise<PaymentPaginatedResponseDto> {
    return this.paymentsService.findAll(query, user.id, false);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get my payment detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: PaymentResponseDto })
  findMineOne(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(id, user.id);
  }

  // ── Admin endpoints ───────────────────────────────────────

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('payment.read')
  @ApiOperation({ summary: 'Admin: list all payments' })
  @ApiOkResponse({ type: PaymentPaginatedResponseDto })
  findAll(@Query() query: PaymentQueryDto): Promise<PaymentPaginatedResponseDto> {
    return this.paymentsService.findAll(query, undefined, true);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('payment.read')
  @ApiOperation({ summary: 'Admin: get payment detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: PaymentResponseDto })
  findOne(@Param('id') id: string): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('payment.update')
  @ApiOperation({ summary: 'Admin: update payment status' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: PaymentResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.updateStatus(id, dto);
  }
}
