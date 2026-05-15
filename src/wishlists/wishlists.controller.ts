import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { WishlistResponseDto } from './dto/wishlist-response.dto';
import { WishlistsService } from './wishlists.service';

@ApiTags('wishlists')
@Controller('wishlists')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my wishlist' })
  @ApiOkResponse({ type: WishlistResponseDto })
  getWishlist(@CurrentUser() user: ICurrentUser): Promise<WishlistResponseDto> {
    return this.wishlistsService.getWishlist(user.id!);
  }

  @Post('me')
  @ApiOperation({ summary: 'Add product to wishlist' })
  @ApiOkResponse({ type: WishlistResponseDto })
  addProduct(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: AddToWishlistDto,
  ): Promise<WishlistResponseDto> {
    return this.wishlistsService.addProduct(user.id!, dto);
  }

  @Delete('me/:productId')
  @ApiOperation({ summary: 'Remove product from wishlist' })
  @ApiParam({ name: 'productId', example: 'uuid-v4' })
  @ApiOkResponse({ type: WishlistResponseDto })
  removeProduct(
    @CurrentUser() user: ICurrentUser,
    @Param('productId') productId: string,
  ): Promise<WishlistResponseDto> {
    return this.wishlistsService.removeProduct(user.id!, productId);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Clear all products from wishlist' })
  @ApiNoContentResponse()
  clearWishlist(
    @CurrentUser() user: ICurrentUser,
  ): Promise<WishlistResponseDto> {
    return this.wishlistsService.clearWishlist(user.id!);
  }
}
