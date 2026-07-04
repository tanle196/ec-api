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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { DiscountListQueryDto } from './dto/discount-list-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import {
  AdminDiscountPaginatedResponseDto,
  AdminDiscountResponseDto,
} from './dto/admin-discount-response.dto';
import { DiscountsService } from './discounts.service';

@ApiTags('Admin: discounts')
@Controller('admin/discounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminDiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Post()
  @Permissions('discount.create')
  @ApiOperation({ summary: 'Admin: create a discount code' })
  @ApiResponse({ status: 201, type: AdminDiscountResponseDto })
  create(@Body() dto: CreateDiscountDto): Promise<AdminDiscountResponseDto> {
    return this.discountsService.create(dto);
  }

  @Get()
  @Permissions('discount.read')
  @ApiOperation({ summary: 'Admin: list discount codes' })
  @ApiOkResponse({ type: AdminDiscountPaginatedResponseDto })
  findAll(
    @Query() query: DiscountListQueryDto,
  ): Promise<AdminDiscountPaginatedResponseDto> {
    return this.discountsService.findAll(query);
  }

  @Get(':id')
  @Permissions('discount.read')
  @ApiOperation({ summary: 'Admin: get discount by ID' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminDiscountResponseDto })
  findOne(@Param('id') id: string): Promise<AdminDiscountResponseDto> {
    return this.discountsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('discount.update')
  @ApiOperation({ summary: 'Admin: update a discount code' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminDiscountResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountDto,
  ): Promise<AdminDiscountResponseDto> {
    return this.discountsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('discount.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a discount code' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.discountsService.remove(id);
  }
}
