import { AdminPaymentResponseDto } from '../dto/admin-payment-response.dto';
import {
  PaymentBaseResponseDto,
  PaymentMetadataDto,
  PaymentResponseDto,
} from '../dto/payment-response.dto';
import { Payment } from '../entities/payment.entity';

export class PaymentMapper {
  private static toBase = (entity: Payment): PaymentBaseResponseDto => ({
    id: entity.id,
    order_id: entity.order_id,
    method: entity.method,
    status: entity.status,
    amount: entity.amount,
    transactionId: entity.transactionId,
    paidAt: entity.paidAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  private static toPublicMetadata = (
    metadata: Record<string, unknown> | null,
  ): PaymentMetadataDto | null => {
    if (!metadata) return null;
    const { checkoutUrl } = metadata;
    return {
      checkoutUrl: typeof checkoutUrl === 'string' ? checkoutUrl : null,
    };
  };

  static toResponse = (entity: Payment): PaymentResponseDto => ({
    ...PaymentMapper.toBase(entity),
    metadata: PaymentMapper.toPublicMetadata(entity.metadata),
  });

  static toAdminResponse = (entity: Payment): AdminPaymentResponseDto => ({
    ...PaymentMapper.toBase(entity),
    metadata: entity.metadata,
  });
}
