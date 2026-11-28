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
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import { ValidateDiscountResponseDto } from './dto/discount-response.dto';
import { DiscountsService } from './discounts.service';

@ApiTags('discounts')
@Controller('discounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a discount code against cart items or a subtotal',
  })
  @ApiOkResponse({ type: ValidateDiscountResponseDto })
  validate(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: ValidateDiscountDto,
  ): Promise<ValidateDiscountResponseDto> {
    return this.discountsService.validate(dto, user.id);
  }
}
