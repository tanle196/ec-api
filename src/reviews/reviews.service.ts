import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewListQueryDto } from './dto/review-list-query.dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { Product } from '@/products/entities/product.entity';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    const product = await this.productRepo.findOne({
      where: { id: dto.product_id },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.reviewRepo.findOne({
      where: { user_id: userId, product_id: dto.product_id },
    });
    if (existing)
      throw new ConflictException('You have already reviewed this product');

    const isVerified = await this.hasDeliveredOrder(userId, dto.product_id);

    const review = this.reviewRepo.create({
      user_id: userId,
      product_id: dto.product_id,
      rating: dto.rating,
      title: dto.title ?? null,
      content: dto.content ?? null,
      isVerified,
      isApproved: false,
    });

    return this.reviewRepo.save(review);
  }

  async findAll(
    query: ReviewListQueryDto,
  ): Promise<PaginatedResponseDto<Review>> {
    const { page = 1, limit = 20, product_id, user_id, rating, isApproved, isVerified } = query;

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u');

    if (product_id) qb.andWhere('r.product_id = :product_id', { product_id });
    if (user_id) qb.andWhere('r.user_id = :user_id', { user_id });
    if (rating !== undefined) qb.andWhere('r.rating = :rating', { rating });
    if (isApproved !== undefined) qb.andWhere('r.isApproved = :isApproved', { isApproved });
    if (isVerified !== undefined) qb.andWhere('r.isVerified = :isVerified', { isVerified });

    const [data, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findApproved(
    productId: string,
    query: ReviewListQueryDto,
  ): Promise<PaginatedResponseDto<Review>> {
    return this.findAll({ ...query, product_id: productId, isApproved: true });
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async findMyReviews(
    userId: string,
    query: ReviewListQueryDto,
  ): Promise<PaginatedResponseDto<Review>> {
    return this.findAll({ ...query, user_id: userId });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateReviewDto,
    isAdmin: boolean,
  ): Promise<Review> {
    const review = await this.findOne(id);

    if (!isAdmin && review.user_id !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.title !== undefined) review.title = dto.title ?? null;
    if (dto.content !== undefined) review.content = dto.content ?? null;

    if (!isAdmin) {
      review.isApproved = false;
    }

    return this.reviewRepo.save(review);
  }

  async approve(id: string, approved: boolean): Promise<Review> {
    const review = await this.findOne(id);
    review.isApproved = approved;
    return this.reviewRepo.save(review);
  }

  async remove(
    id: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<{ success: boolean }> {
    const review = await this.findOne(id);

    if (!isAdmin && review.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.reviewRepo.remove(review);
    return { success: true };
  }

  private async hasDeliveredOrder(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const count = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin('o.items', 'i')
      .innerJoin('i.variant', 'v')
      .where('o.user_id = :userId', { userId })
      .andWhere('o.status = :status', { status: OrderStatus.DELIVERED })
      .andWhere('v.product_id = :productId', { productId })
      .getCount();

    return count > 0;
  }
}
