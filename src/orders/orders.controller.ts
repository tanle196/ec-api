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
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  OrderPaginatedResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ── User endpoints ────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(user.id!, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my orders' })
  @ApiOkResponse({ type: OrderPaginatedResponseDto })
  findMine(
    @CurrentUser() user: ICurrentUser,
    @Query() query: OrderListQueryDto,
  ): Promise<OrderPaginatedResponseDto> {
    return this.ordersService.findAll(query, user.id, false);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get my order detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: OrderResponseDto })
  findMineOne(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.findOne(id, user.id);
  }

  @Patch('me/:id/cancel')
  @ApiOperation({ summary: 'Cancel my order (only pending/confirmed)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: OrderResponseDto })
  cancel(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancel(id, user.id!);
  }

  // ── Admin endpoints ───────────────────────────────────────

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: list all orders' })
  @ApiOkResponse({ type: OrderPaginatedResponseDto })
  findAll(
    @Query() query: OrderListQueryDto,
  ): Promise<OrderPaginatedResponseDto> {
    return this.ordersService.findAll(query, undefined, true);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('order.read')
  @ApiOperation({ summary: 'Admin: get order detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: OrderResponseDto })
  findOne(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('order.update')
  @ApiOperation({ summary: 'Admin: update order status' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: OrderResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateStatus(id, dto);
  }
}
