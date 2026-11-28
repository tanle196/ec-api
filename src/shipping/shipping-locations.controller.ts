import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GhnLocation, GhnProvider } from './carriers/ghn/ghn.provider';

// Province -> district -> ward lists for the address form, so addresses
// carry the codes the carrier books with.
@ApiTags('shipping')
@Controller('shipping/locations')
export class ShippingLocationsController {
  constructor(private readonly ghn: GhnProvider) {}

  @Get()
  @ApiOperation({
    summary:
      'Carrier locations: provinces, or the districts of province_id, or the wards of district_id',
  })
  @ApiQuery({ name: 'province_id', required: false })
  @ApiQuery({ name: 'district_id', required: false })
  list(
    @Query('province_id') provinceId?: string,
    @Query('district_id') districtId?: string,
  ): Promise<GhnLocation[]> {
    if (!this.ghn.isConfigured()) {
      throw new NotFoundException('No carrier location data is configured');
    }
    if (districtId) return this.ghn.locations('ward', districtId);
    if (provinceId) return this.ghn.locations('district', provinceId);
    return this.ghn.locations('province');
  }
}
