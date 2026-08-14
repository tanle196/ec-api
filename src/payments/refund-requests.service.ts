import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { UsersService } from '@/users/users.service';
import { MailService } from '@/mail/mail.service';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import {
  ApproveRefundRequestDto,
  RejectRefundRequestDto,
} from './dto/review-refund-request.dto';
import { RefundRequestQueryDto } from './dto/refund-request-query.dto';
import { Payment } from './entities/payment.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { RefundRequestStatus } from './enums/refund-request-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsService } from './payments.service';

@Injectable()
export class RefundRequestsService {
  private readonly logger = new Logger(RefundRequestsService.name);

  constructor(
    @InjectRepository(RefundRequest)
    private readonly refundRequestRepo: Repository<RefundRequest>,
    private readonly dataSource: DataSource,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async create(
    userId: string,
    dto: CreateRefundRequestDto,
  ): Promise<RefundRequest> {
    const payment = await this.paymentsService.findOne(dto.payment_id);
    if (payment.order.user_id !== userId) throw new ForbiddenException();

    if (
      payment.status !== PaymentStatus.COMPLETED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot request a refund for a payment with status "${payment.status}"`,
      );
    }

    // Locks the payment row so the "how much is already pending/refunded"
    // check and the new RefundRequest insert are atomic against concurrent
    // refund requests for the same payment/items — otherwise both could
    // read the same reserved quantities before either inserts and together
    // over-commit more than what's actually refundable. The same lock is
    // taken by PaymentsService.createRefund/resolveRefundableItems, so this
    // also serializes against an admin approving a request concurrently.
    const refundRequest = await this.dataSource.transaction(async (manager) => {
      await manager.findOne(Payment, {
        where: { id: dto.payment_id },
        lock: { mode: 'pessimistic_write' },
      });

      const reservedQtyByItem = await this.getPendingQuantitiesByItem(
        manager,
        dto.payment_id,
      );

      const { itemsToCreate, amount } =
        await this.paymentsService.resolveRefundableItems(
          manager,
          dto.payment_id,
          dto.items,
          reservedQtyByItem,
        );

      return manager.save(
        RefundRequest,
        manager.create(RefundRequest, {
          payment_id: payment.id,
          order_id: payment.order_id,
          requested_by: userId,
          amount,
          reason: dto.reason,
          status: RefundRequestStatus.PENDING,
          items: itemsToCreate,
        }),
      );
    });

    void this.notifyRequested(refundRequest);

    return refundRequest;
  }

  async findMine(
    userId: string,
    query: RefundRequestQueryDto,
  ): Promise<PaginatedResponseDto<RefundRequest>> {
    return this.findPaginated(query, { requested_by: userId });
  }

  async findMineOne(userId: string, id: string): Promise<RefundRequest> {
    const refundRequest = await this.findOrThrow(id);
    if (refundRequest.requested_by !== userId) throw new ForbiddenException();
    return refundRequest;
  }

  async findAll(
    query: RefundRequestQueryDto,
  ): Promise<PaginatedResponseDto<RefundRequest>> {
    return this.findPaginated(query);
  }

  async findOne(id: string): Promise<RefundRequest> {
    return this.findOrThrow(id);
  }

  async approve(
    id: string,
    adminId: string,
    dto: ApproveRefundRequestDto,
  ): Promise<RefundRequest> {
    const refundRequest = await this.findOrThrow(id);
    if (refundRequest.status !== RefundRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve a refund request with status "${refundRequest.status}"`,
      );
    }

    const refund = await this.paymentsService.createRefund(
      refundRequest.payment_id,
      {
        items: refundRequest.items.map((item) => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
        })),
        reason: refundRequest.reason,
      },
      adminId,
    );

    refundRequest.status = RefundRequestStatus.APPROVED;
    refundRequest.refund_id = refund.id;
    refundRequest.reviewedBy = adminId;
    refundRequest.reviewedAt = new Date();
    refundRequest.adminNote = dto.note ?? null;
    await this.refundRequestRepo.save(refundRequest);

    void this.notifyReviewed(refundRequest);

    return refundRequest;
  }

  async reject(
    id: string,
    adminId: string,
    dto: RejectRefundRequestDto,
  ): Promise<RefundRequest> {
    const refundRequest = await this.findOrThrow(id);
    if (refundRequest.status !== RefundRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject a refund request with status "${refundRequest.status}"`,
      );
    }

    refundRequest.status = RefundRequestStatus.REJECTED;
    refundRequest.reviewedBy = adminId;
    refundRequest.reviewedAt = new Date();
    refundRequest.adminNote = dto.note;
    await this.refundRequestRepo.save(refundRequest);

    void this.notifyReviewed(refundRequest);

    return refundRequest;
  }

  private async findPaginated(
    query: RefundRequestQueryDto,
    extraWhere: Record<string, unknown> = {},
  ): Promise<PaginatedResponseDto<RefundRequest>> {
    const { page = 1, limit = 20, status, order_id, payment_id } = query;

    const [data, total] = await this.refundRequestRepo.findAndCount({
      where: {
        ...extraWhere,
        ...(status ? { status } : {}),
        ...(order_id ? { order_id } : {}),
        ...(payment_id ? { payment_id } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  private async findOrThrow(id: string): Promise<RefundRequest> {
    const refundRequest = await this.refundRequestRepo.findOne({
      where: { id },
    });
    if (!refundRequest) throw new NotFoundException('Refund request not found');
    return refundRequest;
  }

  /**
   * Quantities tied up by other refund requests still awaiting a decision,
   * so a customer can't request more than what's actually left refundable
   * once pending requests are accounted for.
   */
  private async getPendingQuantitiesByItem(
    manager: EntityManager,
    paymentId: string,
  ): Promise<Map<string, number>> {
    const pending = await manager.find(RefundRequest, {
      where: { payment_id: paymentId, status: RefundRequestStatus.PENDING },
    });

    const qtyByItem = new Map<string, number>();
    for (const request of pending) {
      for (const item of request.items) {
        qtyByItem.set(
          item.order_item_id,
          (qtyByItem.get(item.order_item_id) ?? 0) + item.quantity,
        );
      }
    }
    return qtyByItem;
  }

  private async notifyRequested(refundRequest: RefundRequest): Promise<void> {
    try {
      const user = await this.usersService.findById(refundRequest.requested_by);
      if (!user) return;

      await this.mailService.sendRefundRequestReceived(user.email, {
        reason: refundRequest.reason,
        amount: Number(refundRequest.amount),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send refund request received email for request ${refundRequest.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async notifyReviewed(refundRequest: RefundRequest): Promise<void> {
    try {
      const user = await this.usersService.findById(refundRequest.requested_by);
      if (!user) return;

      if (refundRequest.status === RefundRequestStatus.APPROVED) {
        await this.mailService.sendRefundRequestApproved(user.email, {
          reason: refundRequest.reason,
          amount: Number(refundRequest.amount),
          adminNote: refundRequest.adminNote ?? undefined,
        });
      } else if (refundRequest.status === RefundRequestStatus.REJECTED) {
        await this.mailService.sendRefundRequestRejected(user.email, {
          reason: refundRequest.reason,
          amount: Number(refundRequest.amount),
          adminNote: refundRequest.adminNote ?? undefined,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to send refund request reviewed email for request ${refundRequest.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
