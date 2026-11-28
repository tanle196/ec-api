import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { ShippingQuoteResponseDto } from '@/shipping/dto/shipping-response.dto';
import { CreateOrderItemDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

export class ShippingQuoteDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  address_id!: string;

  @ApiPropertyOptional({
    type: [CreateOrderItemDto],
    description: 'Items to ship; the cart when omitted',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsOptional()
  items?: CreateOrderItemDto[];

  @ApiPropertyOptional({ example: 'FREESHIP' })
  @IsString()
  @IsOptional()
  discountCode?: string;
}

@ApiTags('shipping')
@Controller('shipping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ShippingQuoteController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Shipping fee checkout will charge for these items to this address',
  })
  @ApiOkResponse({ type: ShippingQuoteResponseDto })
  quote(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: ShippingQuoteDto,
  ): Promise<ShippingQuoteResponseDto> {
    return this.ordersService.quoteShipping(user.id!, dto);
  }
}
