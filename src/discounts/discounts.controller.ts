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
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import {
  DiscountPaginatedResponseDto,
  DiscountResponseDto,
  ValidateDiscountResponseDto,
} from './dto/discount-response.dto';
import { DiscountsService } from './discounts.service';

@ApiTags('discounts')
@Controller('discounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  // ── Public (authenticated) endpoints ─────────────────────────

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a discount code against a subtotal' })
  @ApiOkResponse({ type: ValidateDiscountResponseDto })
  validate(
    @Body() dto: ValidateDiscountDto,
  ): Promise<ValidateDiscountResponseDto> {
    return this.discountsService.validate(dto);
  }

  // ── Admin endpoints ───────────────────────────────────────────

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('discount.create')
  @ApiOperation({ summary: 'Admin: create a discount code' })
  @ApiResponse({ status: 201, type: DiscountResponseDto })
  create(@Body() dto: CreateDiscountDto): Promise<DiscountResponseDto> {
    return this.discountsService.create(dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('discount.read')
  @ApiOperation({ summary: 'Admin: list discount codes' })
  @ApiOkResponse({ type: DiscountPaginatedResponseDto })
  findAll(
    @Query() query: DiscountListQueryDto,
  ): Promise<DiscountPaginatedResponseDto> {
    return this.discountsService.findAll(query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('discount.read')
  @ApiOperation({ summary: 'Admin: get discount by ID' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: DiscountResponseDto })
  findOne(@Param('id') id: string): Promise<DiscountResponseDto> {
    return this.discountsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('discount.update')
  @ApiOperation({ summary: 'Admin: update a discount code' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: DiscountResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountDto,
  ): Promise<DiscountResponseDto> {
    return this.discountsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('discount.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a discount code' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.discountsService.remove(id);
  }
}
