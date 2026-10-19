import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Payment } from '../entities/payment.entity';
import { RefundRequest } from '../entities/refund-request.entity';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { PaymentPolicy } from './payment.policy';

// Business rules for customer refund requests. Lookups, locking and the
// refundable-quantity calculation stay in RefundRequestsService /
// PaymentsService.
@Injectable()
export class RefundRequestPolicy {
  constructor(private readonly paymentPolicy: PaymentPolicy) {}

  assertCanRequest(
    payment: Pick<Payment, 'status'> & { order: { user_id: string } },
    userId: string,
  ): void {
    this.paymentPolicy.assertOrderOwnedBy(payment.order, userId);
    if (!this.paymentPolicy.isRefundable(payment.status))
      throw new BadRequestException(
        `Cannot request a refund for a payment with status "${payment.status}"`,
      );
  }

  assertRequestedBy(
    refundRequest: Pick<RefundRequest, 'requested_by'>,
    userId: string,
  ): void {
    if (refundRequest.requested_by !== userId) throw new ForbiddenException();
  }

  // Only a PENDING request can be approved or rejected.
  assertReviewable(
    refundRequest: Pick<RefundRequest, 'status'>,
    action: 'approve' | 'reject',
  ): void {
    if (refundRequest.status !== RefundRequestStatus.PENDING)
      throw new BadRequestException(
        `Cannot ${action} a refund request with status "${refundRequest.status}"`,
      );
  }
}
