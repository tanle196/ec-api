import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
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
import { ShippingRateResponseDto } from './dto/shipping-response.dto';
import { UpsertShippingRateDto } from './dto/upsert-shipping-rate.dto';
import { ShippingZone } from './enums/shipping-zone.enum';
import { ShippingRatesService } from './shipping-rates.service';

@ApiTags('Admin: shipping')
@Controller('admin/shipping-rates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminShippingController {
  constructor(private readonly ratesService: ShippingRatesService) {}

  @Get()
  @Permissions('order.read')
  @ApiOperation({ summary: "Admin: the shop's shipping rate table" })
  @ApiOkResponse({ type: [ShippingRateResponseDto] })
  findAll(): Promise<ShippingRateResponseDto[]> {
    return this.ratesService.findAll();
  }

  @Put(':zone')
  @Permissions('order.update')
  @ApiOperation({ summary: 'Admin: set the rate for a zone' })
  @ApiParam({ name: 'zone', enum: ShippingZone })
  @ApiOkResponse({ type: ShippingRateResponseDto })
  upsert(
    @Param('zone', new ParseEnumPipe(ShippingZone)) zone: ShippingZone,
    @Body() dto: UpsertShippingRateDto,
  ): Promise<ShippingRateResponseDto> {
    return this.ratesService.upsert(zone, dto);
  }
}
