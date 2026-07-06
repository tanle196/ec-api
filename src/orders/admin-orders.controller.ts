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
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  AdminOrderPaginatedResponseDto,
  AdminOrderResponseDto,
} from './dto/admin-order-response.dto';
import { OrderStatusHistoryResponseDto } from './dto/order-status-history-response.dto';
import { OrderStatusChangeActor } from './enums/order-status-change-actor.enum';
import { OrdersService } from './orders.service';

@ApiTags('Admin: orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: list all orders' })
  @ApiOkResponse({ type: AdminOrderPaginatedResponseDto })
  findAll(
    @Query() query: OrderListQueryDto,
  ): Promise<AdminOrderPaginatedResponseDto> {
    return this.ordersService.findAll(query, undefined, true);
  }

  @Get(':id')
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: get order detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminOrderResponseDto })
  findOne(@Param('id') id: string): Promise<AdminOrderResponseDto> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @Permissions('order.update')
  @ApiOperation({ summary: 'Admin: update order status' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminOrderResponseDto })
  updateStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderResponseDto> {
    return this.ordersService.updateStatus(id, dto, {
      actorType: OrderStatusChangeActor.ADMIN,
      actorId: user.id,
    });
  }

  @Get(':id/history')
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: get order status history' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: [OrderStatusHistoryResponseDto] })
  getHistory(
    @Param('id') id: string,
  ): Promise<OrderStatusHistoryResponseDto[]> {
    return this.ordersService.getStatusHistory(id);
  }
}
