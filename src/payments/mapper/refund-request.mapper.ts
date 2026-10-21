import { AdminRefundRequestResponseDto } from '../dto/admin-refund-request-response.dto';
import {
  RefundRequestItemResponseDto,
  RefundRequestResponseDto,
} from '../dto/refund-request-response.dto';
import { RefundRequestItem } from '../entities/refund-request-item.entity';
import { RefundRequest } from '../entities/refund-request.entity';

export class RefundRequestMapper {
  static toItem = (item: RefundRequestItem): RefundRequestItemResponseDto => ({
    id: item.id,
    order_item_id: item.order_item_id,
    quantity: item.quantity,
    amount: item.amount,
  });

  // adminNote stays: it is the reviewer's message to the customer and is
  // already sent to them by email. reviewedBy (an admin's user id) does not.
  static toResponse = (entity: RefundRequest): RefundRequestResponseDto => ({
    id: entity.id,
    payment_id: entity.payment_id,
    order_id: entity.order_id,
    requested_by: entity.requested_by,
    amount: entity.amount,
    reason: entity.reason,
    status: entity.status,
    adminNote: entity.adminNote,
    reviewedAt: entity.reviewedAt,
    refund_id: entity.refund_id,
    items: (entity.items ?? []).map(RefundRequestMapper.toItem),
    createdAt: entity.createdAt,
  });

  static toAdminResponse = (
    entity: RefundRequest,
  ): AdminRefundRequestResponseDto => ({
    ...RefundRequestMapper.toResponse(entity),
    reviewedBy: entity.reviewedBy,
  });
}
