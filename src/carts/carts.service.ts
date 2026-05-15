import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly itemRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  async getCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      where: { user_id: userId },
      relations: ['items', 'items.variant'],
    });

    if (!cart) {
      cart = this.cartRepo.create({ user_id: userId });
      cart = await this.cartRepo.save(cart);
      cart.items = [];
    }

    return cart;
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<Cart> {
    const variant = await this.variantRepo.findOne({
      where: { id: dto.variant_id },
    });

    if (!variant) throw new NotFoundException('Variant not found');
    if (!variant.isActive)
      throw new UnprocessableEntityException('Variant is inactive');

    const quantity = dto.quantity ?? 1;

    if (variant.stock < quantity) {
      throw new UnprocessableEntityException(
        `Insufficient stock: available ${variant.stock}, requested ${quantity}`,
      );
    }

    const cart = await this.getCart(userId);

    const existing = await this.itemRepo.findOne({
      where: { cart_id: cart.id, variant_id: dto.variant_id },
    });

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (variant.stock < newQty) {
        throw new UnprocessableEntityException(
          `Insufficient stock: available ${variant.stock}, requested ${newQty}`,
        );
      }
      existing.quantity = newQty;
      await this.itemRepo.save(existing);
    } else {
      const item = this.itemRepo.create({
        cart_id: cart.id,
        variant_id: dto.variant_id,
        quantity,
      });
      await this.itemRepo.save(item);
    }

    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<Cart> {
    const cart = await this.getCart(userId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, cart_id: cart.id },
    });

    if (!item) throw new NotFoundException('Cart item not found');

    const variant = await this.variantRepo.findOne({
      where: { id: item.variant_id },
    });

    if (variant && variant.stock < dto.quantity) {
      throw new UnprocessableEntityException(
        `Insufficient stock: available ${variant.stock}, requested ${dto.quantity}`,
      );
    }

    item.quantity = dto.quantity;
    await this.itemRepo.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, cart_id: cart.id },
    });

    if (!item) throw new NotFoundException('Cart item not found');

    await this.itemRepo.remove(item);
    return this.getCart(userId);
  }

  async clearCart(userId: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    await this.itemRepo.delete({ cart_id: cart.id });
    return this.getCart(userId);
  }
}
