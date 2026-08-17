import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
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

    await this.dataSource.transaction(async (manager) => {
      // Re-read the variant's stock inside the transaction under a shared
      // lock, since the value fetched above can already be stale by the
      // time we get here (e.g. an order decremented it in the meantime).
      // The lock also blocks a concurrent stock decrement from committing
      // until this check has run, so the two can't race.
      const freshVariant = await manager.findOne(ProductVariant, {
        where: { id: dto.variant_id },
        lock: { mode: 'pessimistic_read' },
      });

      if (!freshVariant) throw new NotFoundException('Variant not found');

      // Atomic upsert keyed on the (cart_id, variant_id) unique constraint:
      // two concurrent addItem calls for the same variant now serialize on
      // this row instead of both reading "no existing row" and each
      // inserting their own, which used to leave two cart_item rows for one
      // variant. DO UPDATE merges the quantity in the same statement that
      // creates the row, so there's no separate read-then-write to race.
      const [{ quantity: newQty }]: { quantity: number }[] =
        await manager.query(
          `INSERT INTO "cart_items" ("cart_id", "variant_id", "quantity")
           VALUES ($1, $2, $3)
           ON CONFLICT ("cart_id", "variant_id")
           DO UPDATE SET
             "quantity" = "cart_items"."quantity" + EXCLUDED."quantity",
             "updatedAt" = now()
           RETURNING "quantity"`,
          [cart.id, dto.variant_id, quantity],
        );

      // Re-validate against the merged total inside the same transaction, so
      // an insufficient-stock error rolls back the upsert above instead of
      // leaving a partially-applied quantity change.
      if (freshVariant.stock < newQty) {
        throw new UnprocessableEntityException(
          `Insufficient stock: available ${freshVariant.stock}, requested ${newQty}`,
        );
      }
    });

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
