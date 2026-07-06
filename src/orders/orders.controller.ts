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
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import {
  OrderPaginatedResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { OrderStatusHistoryResponseDto } from './dto/order-status-history-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(user.id!, dto);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create an order from my cart, then clear it' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  checkout(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CheckoutDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.checkout(user.id!, dto);
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

  @Get('me/:id/history')
  @ApiOperation({ summary: 'Get status history of my order' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: [OrderStatusHistoryResponseDto] })
  getHistory(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<OrderStatusHistoryResponseDto[]> {
    return this.ordersService.getStatusHistory(id, user.id);
  }
}
