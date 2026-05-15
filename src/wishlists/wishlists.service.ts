import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '@/products/entities/product.entity';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { WishlistResponseDto } from './dto/wishlist-response.dto';
import { Wishlist } from './entities/wishlist.entity';

@Injectable()
export class WishlistsService {
  constructor(
    @InjectRepository(Wishlist)
    private readonly wishlistRepo: Repository<Wishlist>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async getWishlist(userId: string): Promise<WishlistResponseDto> {
    const items = await this.wishlistRepo.find({
      where: { user_id: userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });

    return { items, total: items.length };
  }

  async addProduct(
    userId: string,
    dto: AddToWishlistDto,
  ): Promise<WishlistResponseDto> {
    const product = await this.productRepo.findOne({
      where: { id: dto.product_id },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.wishlistRepo.findOne({
      where: { user_id: userId, product_id: dto.product_id },
    });
    if (existing)
      throw new ConflictException('Product is already in your wishlist');

    const item = this.wishlistRepo.create({
      user_id: userId,
      product_id: dto.product_id,
    });
    await this.wishlistRepo.save(item);

    return this.getWishlist(userId);
  }

  async removeProduct(
    userId: string,
    productId: string,
  ): Promise<WishlistResponseDto> {
    const item = await this.wishlistRepo.findOne({
      where: { user_id: userId, product_id: productId },
    });
    if (!item) throw new NotFoundException('Product not in wishlist');

    await this.wishlistRepo.remove(item);

    return this.getWishlist(userId);
  }

  async clearWishlist(userId: string): Promise<WishlistResponseDto> {
    await this.wishlistRepo.delete({ user_id: userId });
    return this.getWishlist(userId);
  }
}
