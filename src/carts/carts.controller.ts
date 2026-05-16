import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { CartsService } from './carts.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';

@ApiTags('carts')
@Controller('carts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my cart' })
  @ApiOkResponse({ type: CartResponseDto })
  getCart(@CurrentUser() user: ICurrentUser): Promise<CartResponseDto> {
    return this.cartsService.getCart(user.id!);
  }

  @Post('me/items')
  @ApiOperation({
    summary: 'Add item to cart (merges quantity if variant already in cart)',
  })
  @ApiOkResponse({ type: CartResponseDto })
  addItem(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartsService.addItem(user.id!, dto);
  }

  @Patch('me/items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'itemId', example: 'uuid-v4' })
  @ApiOkResponse({ type: CartResponseDto })
  updateItem(
    @CurrentUser() user: ICurrentUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartsService.updateItem(user.id!, itemId, dto);
  }

  @Delete('me/items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'itemId', example: 'uuid-v4' })
  @ApiOkResponse({ type: CartResponseDto })
  removeItem(
    @CurrentUser() user: ICurrentUser,
    @Param('itemId') itemId: string,
  ): Promise<CartResponseDto> {
    return this.cartsService.removeItem(user.id!, itemId);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiNoContentResponse()
  clearCart(@CurrentUser() user: ICurrentUser): Promise<CartResponseDto> {
    return this.cartsService.clearCart(user.id!);
  }
}
