import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { BannerResponseDto } from './dto/banner-response.dto';
import { BannerPosition } from './enums/banner-position.enum';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  // ── Public endpoints ──────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Lấy banner đang active theo vị trí (dành cho home page)' })
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

  // ── Admin endpoints ───────────────────────────────────────────

  @Get('admin')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.read')
  @ApiOperation({ summary: 'Admin: xem tất cả banner kể cả inactive / hết hạn' })
  @ApiQuery({ name: 'position', enum: BannerPosition, required: false })
  @ApiOkResponse({ type: [BannerResponseDto] })
  findAll(
    @Query('position') position?: BannerPosition,
  ): Promise<BannerResponseDto[]> {
    return this.bannersService.findAll(position);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.create')
  @ApiOperation({ summary: 'Admin: tạo banner mới' })
  @ApiResponse({ status: 201, type: BannerResponseDto })
  create(@Body() dto: CreateBannerDto): Promise<BannerResponseDto> {
    return this.bannersService.create(dto);
  }

  @Post(':id/upload-image')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Admin: upload ảnh cho banner (desktop hoặc mobile)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        isMobile: { type: 'boolean', description: 'true = ảnh mobile, false = ảnh desktop' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: BannerResponseDto })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('isMobile') isMobile?: string,
  ): Promise<BannerResponseDto> {
    return this.bannersService.uploadImage(id, file, isMobile === 'true');
  }

  @Patch('reorder')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: sắp xếp thứ tự hiển thị banner' })
  @ApiNoContentResponse()
  reorder(@Body() dto: ReorderBannersDto): Promise<void> {
    return this.bannersService.reorder(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.update')
  @ApiOperation({ summary: 'Admin: cập nhật banner' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: BannerResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<BannerResponseDto> {
    return this.bannersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('banner.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: xóa banner và ảnh trên cloud' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.bannersService.remove(id);
  }
}
