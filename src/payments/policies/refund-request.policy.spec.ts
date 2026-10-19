import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentStatus } from '../enums/payment-status.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { PaymentPolicy } from './payment.policy';
import { RefundRequestPolicy } from './refund-request.policy';

describe('RefundRequestPolicy', () => {
  const policy = new RefundRequestPolicy(new PaymentPolicy());
  const payment = (status: PaymentStatus) => ({
    status,
    order: { user_id: 'user-1' },
  });

  describe('assertCanRequest', () => {
    it('allows the owner of a paid payment', () => {
      expect(() =>
        policy.assertCanRequest(payment(PaymentStatus.COMPLETED), 'user-1'),
      ).not.toThrow();
    });

    it('rejects another user', () => {
      expect(() =>
        policy.assertCanRequest(payment(PaymentStatus.COMPLETED), 'user-2'),
      ).toThrow(ForbiddenException);
    });

    it('rejects a payment that is not refundable', () => {
      expect(() =>
        policy.assertCanRequest(payment(PaymentStatus.PENDING), 'user-1'),
      ).toThrow(BadRequestException);
    });
  });

  it('assertRequestedBy rejects other users', () => {
    expect(() =>
      policy.assertRequestedBy({ requested_by: 'user-1' }, 'user-1'),
    ).not.toThrow();
    expect(() =>
      policy.assertRequestedBy({ requested_by: 'user-1' }, 'user-2'),
    ).toThrow(ForbiddenException);
  });

  it('assertReviewable only allows PENDING requests', () => {
    expect(() =>
      policy.assertReviewable(
        { status: RefundRequestStatus.PENDING },
        'approve',
      ),
    ).not.toThrow();
    expect(() =>
      policy.assertReviewable(
        { status: RefundRequestStatus.APPROVED },
        'reject',
      ),
    ).toThrow(
      `Cannot reject a refund request with status "${RefundRequestStatus.APPROVED}"`,
    );
  });
});
