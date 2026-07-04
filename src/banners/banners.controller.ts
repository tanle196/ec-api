import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BannersService } from './banners.service';
import { BannerResponseDto } from './dto/banner-response.dto';
import { BannerPosition } from './enums/banner-position.enum';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy banner đang active theo vị trí (dành cho home page)',
  })
  @ApiQuery({ name: 'position', enum: BannerPosition, required: false })
  @ApiOkResponse({ type: [BannerResponseDto] })
  findActive(
    @Query('position') position?: BannerPosition,
  ): Promise<BannerResponseDto[]> {
    return this.bannersService.findActive(position);
  }

  @Post(':id/click')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ghi nhận click vào banner' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse()
  trackClick(@Param('id') id: string): Promise<void> {
    return this.bannersService.incrementClickCount(id);
  }
}
