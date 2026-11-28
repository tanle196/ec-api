import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { mapPaginated } from '@/common/dto/pagination.dto';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import {
  InventoryAuditResponseDto,
  InventoryMovementPaginatedResponseDto,
  StockReceiptPaginatedResponseDto,
  StockReceiptResponseDto,
  VariantStockPaginatedResponseDto,
  VariantStockResponseDto,
} from './dto/inventory-response.dto';
import { InventoryMovementQueryDto } from './dto/inventory-movement-query.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockReceiptQueryDto } from './dto/stock-receipt-query.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';
import { VariantStockQueryDto } from './dto/variant-stock-query.dto';
import { InventoryAuditService } from './inventory-audit.service';
import { InventoryService } from './inventory.service';
import { InventoryMapper } from './mapper/inventory.mapper';
import { StockReceiptsService } from './stock-receipts.service';

@ApiTags('Admin: inventory')
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminInventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly receiptsService: StockReceiptsService,
    private readonly auditService: InventoryAuditService,
  ) {}

  @Get('movements')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Admin: stock ledger, newest first' })
  @ApiOkResponse({ type: InventoryMovementPaginatedResponseDto })
  findMovements(@Query() query: InventoryMovementQueryDto) {
    return this.inventoryService
      .findMovements(query)
      .then((page) => mapPaginated(page, InventoryMapper.toMovement));
  }

  @Get('variants')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Admin: available, reserved, on-hand and cost per variant',
  })
  @ApiOkResponse({ type: VariantStockPaginatedResponseDto })
  findVariantStock(@Query() query: VariantStockQueryDto) {
    return this.inventoryService
      .findVariantStock(query)
      .then((page) => mapPaginated(page, InventoryMapper.toVariantStock));
  }

  @Get('low-stock')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Admin: active variants at or below their low-stock threshold',
  })
  @ApiOkResponse({ type: VariantStockPaginatedResponseDto })
  findLowStock(@Query() query: LowStockQueryDto) {
    return this.inventoryService
      .findLowStock(query)
      .then((page) => mapPaginated(page, InventoryMapper.toVariantStock));
  }

  @Get('audit')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Admin: check stock counters against the ledger',
  })
  @ApiOkResponse({ type: InventoryAuditResponseDto })
  audit(): Promise<InventoryAuditResponseDto> {
    return this.auditService.audit();
  }

  @Post('adjustments')
  @Permissions('inventory.update')
  @ApiOperation({
    summary: 'Admin: correct stock (stocktake count or a delta)',
  })
  @ApiResponse({ status: 201, type: VariantStockResponseDto })
  adjust(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: StockAdjustmentDto,
  ): Promise<VariantStockResponseDto> {
    return this.inventoryService
      .adjust({
        variantId: dto.variant_id,
        onHand: dto.onHand,
        delta: dto.delta,
        note: dto.note,
        actorId: user.id!,
      })
      .then(InventoryMapper.toVariantStock);
  }

  @Post('receipts')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Admin: create a draft stock receipt' })
  @ApiResponse({ status: 201, type: StockReceiptResponseDto })
  createReceipt(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    return this.receiptsService
      .create(dto, user.id!)
      .then(InventoryMapper.toReceipt);
  }

  @Get('receipts')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Admin: list stock receipts' })
  @ApiOkResponse({ type: StockReceiptPaginatedResponseDto })
  findReceipts(@Query() query: StockReceiptQueryDto) {
    return this.receiptsService
      .findAll(query)
      .then((page) => mapPaginated(page, InventoryMapper.toReceipt));
  }

  @Get('receipts/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Admin: get a stock receipt' })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  findReceipt(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockReceiptResponseDto> {
    return this.receiptsService.findOne(id).then(InventoryMapper.toReceipt);
  }

  @Patch('receipts/:id')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Admin: edit a draft stock receipt' })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  updateReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    return this.receiptsService.update(id, dto).then(InventoryMapper.toReceipt);
  }

  @Post('receipts/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory.update')
  @ApiOperation({
    summary: 'Admin: confirm a draft receipt, adding its goods to stock',
  })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  confirmReceipt(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockReceiptResponseDto> {
    return this.receiptsService
      .confirm(id, user.id!)
      .then(InventoryMapper.toReceipt);
  }

  @Post('receipts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Admin: cancel a draft receipt' })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  cancelReceipt(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockReceiptResponseDto> {
    return this.receiptsService.cancel(id).then(InventoryMapper.toReceipt);
  }
}
