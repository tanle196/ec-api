import {
  BadRequestException,
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
import { OrderStatus } from './enums/order-status.enum';
import { OrdersService } from './orders.service';
import { ShipmentEventSource } from './shipments/enums/shipment-event-source.enum';
import { ShipmentStatus } from './shipments/enums/shipment-status.enum';
import { ShipmentsService } from './shipments/shipments.service';
import { mapPaginated } from '@/common/dto/pagination.dto';
import { OrderMapper } from './mapper/order.mapper';

@ApiTags('Admin: orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly shipmentsService: ShipmentsService,
  ) {}

  @Get()
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: list all orders' })
  @ApiOkResponse({ type: AdminOrderPaginatedResponseDto })
  findAll(
    @Query() query: OrderListQueryDto,
  ): Promise<AdminOrderPaginatedResponseDto> {
    return this.ordersService
      .findAll(query, undefined, true)
      .then((page) => mapPaginated(page, OrderMapper.toListItem));
  }

  @Get(':id')
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: get order detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminOrderResponseDto })
  findOne(@Param('id') id: string): Promise<AdminOrderResponseDto> {
    return this.ordersService.findOne(id).then(OrderMapper.toResponse);
  }

  @Patch(':id/status')
  @Permissions('order.update')
  @ApiOperation({ summary: 'Admin: update order status' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminOrderResponseDto })
  async updateStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderResponseDto> {
    // "Shipped" and "delivered" picked from the status dropdown are
    // shipment steps; anything more detailed (carrier, tracking, failed
    // attempts, returns) goes through the shipments endpoints.
    const actor = { source: ShipmentEventSource.ADMIN, actorId: user.id };
    if (dto.status === OrderStatus.SHIPPED) {
      await this.shipmentsService.handOver(
        id,
        { carrier: 'manual', note: dto.note },
        actor,
      );
      return this.ordersService.findOne(id).then(OrderMapper.toResponse);
    }
    if (dto.status === OrderStatus.DELIVERED) {
      const shipment = await this.shipmentsService.findActiveForOrder(id);
      if (!shipment) {
        throw new BadRequestException('Order has no shipment on its way');
      }
      await this.shipmentsService.recordEvent(
        shipment.id,
        { status: ShipmentStatus.DELIVERED, description: dto.note },
        actor,
      );
      return this.ordersService.findOne(id).then(OrderMapper.toResponse);
    }

    return this.ordersService
      .updateStatus(id, dto, {
        actorType: OrderStatusChangeActor.ADMIN,
        actorId: user.id,
      })
      .then(OrderMapper.toResponse);
  }

  @Get(':id/history')
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: get order status history' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: [OrderStatusHistoryResponseDto] })
  getHistory(
    @Param('id') id: string,
  ): Promise<OrderStatusHistoryResponseDto[]> {
    return this.ordersService
      .getStatusHistory(id)
      .then(OrderMapper.toStatusHistoryList);
  }
}
