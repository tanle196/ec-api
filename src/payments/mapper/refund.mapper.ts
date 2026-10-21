import {
  RefundItemResponseDto,
  RefundResponseDto,
} from '../dto/refund-response.dto';
import { RefundItem } from '../entities/refund-item.entity';
import { Refund } from '../entities/refund.entity';

export class RefundMapper {
  static toItem = (item: RefundItem): RefundItemResponseDto => ({
    id: item.id,
    order_item_id: item.order_item_id,
    quantity: item.quantity,
    amount: item.amount,
  });

  static toResponse = (entity: Refund): RefundResponseDto => ({
    id: entity.id,
    payment_id: entity.payment_id,
    order_id: entity.order_id,
    amount: entity.amount,
    reason: entity.reason,
    status: entity.status,
    transactionId: entity.transactionId,
    actorId: entity.actorId,
    items: (entity.items ?? []).map(RefundMapper.toItem),
    createdAt: entity.createdAt,
  });

  static toResponseList = (entities: Refund[]): RefundResponseDto[] =>
    entities.map(RefundMapper.toResponse);
}
