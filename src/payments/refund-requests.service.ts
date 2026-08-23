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
    // Phase 1 — lock the RefundRequest row and reserve it by flipping
    // straight to APPROVED before calling out to the gateway. Without this,
    // a concurrent approve()/approve() (double-click, retry) or
    // approve()/reject() race could both read PENDING before either writes:
    // two approvals would each issue a real Stripe refund for the same
    // request, or an approval could land a real refund under a row whose
    // final persisted status is REJECTED. The lock is released as soon as
    // this transaction commits, before the (potentially slow) gateway call
    // in createRefund below — see PaymentsService.createRefund for the same
    // pattern.
    const refundRequest = await this.dataSource.transaction(async (manager) => {
      const rr = await this.lockRefundRequest(manager, id);
      if (!rr) throw new NotFoundException('Refund request not found');
      if (rr.status !== RefundRequestStatus.PENDING) {
        throw new BadRequestException(
          `Cannot approve a refund request with status "${rr.status}"`,
        );
      }

      rr.status = RefundRequestStatus.APPROVED;
      rr.reviewedBy = adminId;
      rr.reviewedAt = new Date();
      rr.adminNote = dto.note ?? null;
      return manager.save(RefundRequest, rr);
    });

    // Phase 2 — call the gateway outside the lock/transaction (network I/O).
    try {
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
      refundRequest.refund_id = refund.id;
      await this.refundRequestRepo.save(refundRequest);
    } catch (error) {
      // createRefund failed (validation or gateway error) after this
      // request was already reserved as APPROVED above — revert back to
      // PENDING so it isn't left stuck "approved" with no refund_id, and so
      // an admin can correct/retry it instead of hitting the terminal-status
      // check on every future approve()/reject() call.
      refundRequest.status = RefundRequestStatus.PENDING;
      refundRequest.reviewedBy = null;
      refundRequest.reviewedAt = null;
      refundRequest.adminNote = null;
      await this.refundRequestRepo.save(refundRequest);
      throw error;
    }

    void this.notifyReviewed(refundRequest);

    return refundRequest;
  }

  async reject(
    id: string,
    adminId: string,
    dto: RejectRefundRequestDto,
  ): Promise<RefundRequest> {
    // Same locked read-check-write as approve() — closes the identical race
    // against a concurrent approve()/reject() on the same request.
    const refundRequest = await this.dataSource.transaction(async (manager) => {
      const rr = await this.lockRefundRequest(manager, id);
      if (!rr) throw new NotFoundException('Refund request not found');
      if (rr.status !== RefundRequestStatus.PENDING) {
        throw new BadRequestException(
          `Cannot reject a refund request with status "${rr.status}"`,
        );
      }

      rr.status = RefundRequestStatus.REJECTED;
      rr.reviewedBy = adminId;
      rr.reviewedAt = new Date();
      rr.adminNote = dto.note;
      return manager.save(RefundRequest, rr);
    });

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

  // Shared pessimistic-lock read used by approve()/reject() so the lock
  // acquisition can't drift out of sync between the two call sites — see
  // PaymentsService.lockPayment for the same pattern. Locks only the
  // refund_requests row via a raw FOR UPDATE rather than manager.findOne:
  // RefundRequest.items is an eager OneToMany, which findOne pulls in via a
  // LEFT JOIN, and Postgres rejects FOR UPDATE against the nullable side of
  // an outer join. The raw row lock still fully serializes concurrent
  // approve()/reject() calls; the follow-up findOne (unlocked, within the
  // same transaction) is guaranteed to see consistent data once we hold it.
  private async lockRefundRequest(
    manager: EntityManager,
    id: string,
  ): Promise<RefundRequest | null> {
    const locked = await manager.query<{ id: string }[]>(
      'SELECT id FROM refund_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!locked.length) return null;
    return manager.findOne(RefundRequest, { where: { id } });
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
