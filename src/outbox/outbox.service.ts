import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { OutboxQueryDto } from './dto/outbox-query.dto';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventStatus } from './enums/outbox-event-status.enum';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export const OUTBOX_MAX_ATTEMPTS = 10;
// While a dispatcher run handles an event, nobody else picks it up. If the
// process dies mid-handler the event becomes available again after this.
const LEASE_MS = 5 * 60_000;

/** Retry delay after the n-th failed attempt: 10s, 20s, 40s... up to 1h. */
export function backoffMs(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(attempts - 1, 0), 60 * 60_000);
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, OutboxHandler>();

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly eventRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
  ) {}

  /** One handler per event type; registered by consumers at startup. */
  register(type: string, handler: OutboxHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Outbox handler for "${type}" is already registered`);
    }
    this.handlers.set(type, handler);
  }

  /** Must be called with the transaction that makes the change. */
  async enqueue(
    manager: EntityManager,
    event: {
      type: string;
      aggregateType: string;
      aggregateId: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.insert(OutboxEvent, {
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload ?? {},
    } as QueryDeepPartialEntity<OutboxEvent>);
  }

  /**
   * Claims up to `limit` due events (SKIP LOCKED, so several instances can
   * run this at once without handling the same event), leases them, and
   * runs their handlers outside any transaction. Returns how many were
   * handled successfully.
   */
  async dispatchDue(limit = 50, now: Date = new Date()): Promise<number> {
    const claimed = await this.dataSource.transaction(async (manager) => {
      const due = await manager
        .createQueryBuilder(OutboxEvent, 'e')
        .where('e.status = :pending', { pending: OutboxEventStatus.PENDING })
        .andWhere('e.availableAt <= :now', { now })
        .orderBy('e.createdAt', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      for (const event of due) {
        event.attempts += 1;
        event.availableAt = new Date(now.getTime() + LEASE_MS);
        await manager.update(OutboxEvent, event.id, {
          attempts: event.attempts,
          availableAt: event.availableAt,
        });
      }
      return due;
    });

    let handled = 0;
    for (const event of claimed) {
      if (await this.run(event)) handled++;
    }
    return handled;
  }

  async findAll(
    query: OutboxQueryDto,
  ): Promise<PaginatedResponseDto<OutboxEvent>> {
    const { page = 1, limit = 20, status, type, aggregate_id } = query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (aggregate_id) where.aggregateId = aggregate_id;

    const [data, total] = await this.eventRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  /** Puts a dead event back in the queue with a fresh set of attempts. */
  async retry(id: string): Promise<OutboxEvent> {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Outbox event not found');
    await this.eventRepo.update(id, {
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      availableAt: new Date(),
      lastError: null,
    });
    return this.eventRepo.findOneOrFail({ where: { id } });
  }

  private async run(event: OutboxEvent): Promise<boolean> {
    const handler = this.handlers.get(event.type);
    try {
      if (!handler) throw new Error(`No handler for "${event.type}"`);
      await handler(event);
      await this.eventRepo.update(event.id, {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const dead = !handler || event.attempts >= OUTBOX_MAX_ATTEMPTS;
      this.logger[dead ? 'error' : 'warn'](
        `Outbox event ${event.id} (${event.type}) failed attempt ${event.attempts}: ${message}`,
      );
      await this.eventRepo.update(event.id, {
        status: dead ? OutboxEventStatus.DEAD : OutboxEventStatus.PENDING,
        availableAt: new Date(Date.now() + backoffMs(event.attempts)),
        lastError: message.slice(0, 2000),
      });
      return false;
    }
  }
}
