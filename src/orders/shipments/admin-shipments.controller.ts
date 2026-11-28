import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { RecordShipmentEventDto } from './dto/record-shipment-event.dto';
import { ShipmentResponseDto } from './dto/shipment-response.dto';
import { ShipmentEventSource } from './enums/shipment-event-source.enum';
import { ShipmentMapper } from './shipment.mapper';
import { ShipmentsService } from './shipments.service';

@ApiTags('Admin: shipments')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('orders/:orderId/shipments')
  @Permissions('order.update')
  @ApiOperation({
    summary: 'Admin: hand a processing order to a carrier (-> shipped)',
  })
  @ApiResponse({ status: 201, type: ShipmentResponseDto })
  handOver(
    @CurrentUser() user: ICurrentUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateShipmentDto,
  ): Promise<ShipmentResponseDto> {
    return this.shipmentsService
      .handOver(orderId, dto, {
        source: ShipmentEventSource.ADMIN,
        actorId: user.id,
      })
      .then(ShipmentMapper.toResponse);
  }

  @Get('orders/:orderId/shipments')
  @Permissions('order.read')
  @ApiOperation({
    summary: "Admin: an order's shipments with tracking history",
  })
  @ApiOkResponse({ type: [ShipmentResponseDto] })
  findForOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<ShipmentResponseDto[]> {
    return this.shipmentsService
      .findForOrder(orderId)
      .then((list) => list.map(ShipmentMapper.toResponse));
  }

  @Post('shipments/:id/events')
  @HttpCode(HttpStatus.OK)
  @Permissions('order.update')
  @ApiOperation({
    summary:
      'Admin: record a tracking update (delivered, delivery_failed, re-attempt, returning, returned)',
  })
  @ApiOkResponse({ type: ShipmentResponseDto })
  recordEvent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordShipmentEventDto,
  ): Promise<ShipmentResponseDto> {
    return this.shipmentsService
      .recordEvent(id, dto, {
        source: ShipmentEventSource.ADMIN,
        actorId: user.id,
      })
      .then(ShipmentMapper.toResponse);
  }
}
