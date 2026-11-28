import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { PaymentIssueQueryDto } from './dto/payment-issue-query.dto';
import { PaymentIssue } from './entities/payment-issue.entity';
import { PaymentIssueStatus } from './enums/payment-issue-status.enum';
import { PaymentIssueType } from './enums/payment-issue-type.enum';
import { PaymentMethod } from './enums/payment-method.enum';

export interface RaiseIssueParams {
  type: PaymentIssueType;
  summary: string;
  paymentId?: string | null;
  orderId?: string | null;
  method?: PaymentMethod | null;
  details?: Record<string, unknown>;
  // Record an issue that was already handled automatically.
  resolved?: boolean;
}

@Injectable()
export class PaymentIssuesService {
  constructor(
    @InjectRepository(PaymentIssue)
    private readonly issueRepo: Repository<PaymentIssue>,
  ) {}

  /**
   * Records an issue. A second OPEN issue of the same type for the same
   * payment is silently skipped (partial unique index), so callers can
   * raise freely on every reconciliation pass.
   */
  async raise(
    params: RaiseIssueParams,
    manager: EntityManager = this.issueRepo.manager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(PaymentIssue)
      .values({
        type: params.type,
        summary: params.summary,
        payment_id: params.paymentId ?? null,
        order_id: params.orderId ?? null,
        method: params.method ?? null,
        details: params.details ?? null,
        status: params.resolved
          ? PaymentIssueStatus.RESOLVED
          : PaymentIssueStatus.OPEN,
        resolvedAt: params.resolved ? new Date() : null,
        resolutionNote: params.resolved ? 'Handled automatically' : null,
      } as QueryDeepPartialEntity<PaymentIssue>)
      .orIgnore()
      .execute();
  }

  /**
   * Closes a payment's open issues of the given types once the thing they
   * were about has been put right (e.g. a later COD remittance matched).
   */
  async resolveOpen(
    paymentId: string,
    types: PaymentIssueType[],
    note: string,
    actorId: string | null,
    manager: EntityManager = this.issueRepo.manager,
  ): Promise<void> {
    await manager.update(
      PaymentIssue,
      {
        payment_id: paymentId,
        type: In(types),
        status: PaymentIssueStatus.OPEN,
      },
      {
        status: PaymentIssueStatus.RESOLVED,
        resolvedBy: actorId,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    );
  }

  async findAll(
    query: PaymentIssueQueryDto,
  ): Promise<PaginatedResponseDto<PaymentIssue>> {
    const { page = 1, limit = 20, status, type, payment_id, order_id } = query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (payment_id) where.payment_id = payment_id;
    if (order_id) where.order_id = order_id;

    const [data, total] = await this.issueRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async resolve(
    id: string,
    actorId: string,
    note: string,
  ): Promise<PaymentIssue> {
    const issue = await this.issueRepo.findOne({ where: { id } });
    if (!issue) throw new NotFoundException('Payment issue not found');
    if (issue.status === PaymentIssueStatus.RESOLVED) {
      throw new BadRequestException('Payment issue is already resolved');
    }

    issue.status = PaymentIssueStatus.RESOLVED;
    issue.resolvedBy = actorId;
    issue.resolvedAt = new Date();
    issue.resolutionNote = note;
    return this.issueRepo.save(issue);
  }
}
