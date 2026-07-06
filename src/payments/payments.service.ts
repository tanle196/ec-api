import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrdersService } from '@/orders/orders.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
  ) {}

  async create(userId: string, dto: CreatePaymentDto): Promise<Payment> {
    const order = await this.orderRepo.findOne({ where: { id: dto.order_id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.user_id !== userId) throw new ForbiddenException();

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot pay for an order with status "${order.status}"`,
      );
    }

    const existingActive = await this.paymentRepo.findOne({
      where: [
        { order_id: dto.order_id, status: PaymentStatus.PENDING },
        { order_id: dto.order_id, status: PaymentStatus.COMPLETED },
      ],
    });

    if (existingActive) {
      throw new BadRequestException(
        'An active payment already exists for this order',
      );
    }

    const payment = this.paymentRepo.create({
      order_id: dto.order_id,
      method: dto.method,
      status: PaymentStatus.PENDING,
      amount: order.total,
    });

    return this.paymentRepo.save(payment);
  }

  async findAll(
    query: PaymentQueryDto,
    requesterId?: string,
    isAdmin = false,
  ): Promise<PaginatedResponseDto<Payment>> {
    const { page = 1, limit = 20, status, order_id, user_id } = query;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoin('p.order', 'o');

    if (!isAdmin) {
      qb.andWhere('o.user_id = :userId', { userId: requesterId });
    } else if (user_id) {
      qb.andWhere('o.user_id = :userId', { userId: user_id });
    }

    if (status) qb.andWhere('p.status = :status', { status });
    if (order_id) qb.andWhere('p.order_id = :order_id', { order_id });

    const [data, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, userId?: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['order'],
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (userId && payment.order.user_id !== userId)
      throw new ForbiddenException();

    return payment;
  }

  async updateStatus(
    id: string,
    dto: UpdatePaymentStatusDto,
    actorId?: string,
  ): Promise<Payment> {
    const payment = await this.findOne(id);

    if (
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot update a payment with status "${payment.status}"`,
      );
    }

    payment.status = dto.status;

    if (dto.transactionId !== undefined) {
      payment.transactionId = dto.transactionId;
    }
    if (dto.metadata !== undefined) {
      payment.metadata = dto.metadata;
    }

    if (dto.status === PaymentStatus.COMPLETED) {
      payment.paidAt = new Date();
      await this.ordersService.applyStatusChange(
        payment.order_id,
        OrderStatus.CONFIRMED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId,
          note: 'Payment completed',
        },
      );
    }

    if (dto.status === PaymentStatus.REFUNDED) {
      await this.ordersService.applyStatusChange(
        payment.order_id,
        OrderStatus.REFUNDED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId,
          note: 'Payment refunded',
        },
      );
    }

    return this.paymentRepo.save(payment);
  }
}
