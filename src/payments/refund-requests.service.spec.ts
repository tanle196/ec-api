import { RefundRequestsService } from './refund-requests.service';
import { RefundRequestStatus } from './enums/refund-request-status.enum';

describe('RefundRequestsService', () => {
  const buildService = () => {
    // A single fake EntityManager shared by every `dataSource.transaction`
    // call — mirrors PaymentsService's spec harness. `query` backs the raw
    // `FOR UPDATE` row lock; `findOne` backs the follow-up eager-relation
    // read of the same row.
    const manager = {
      query: jest.fn(),
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((_entity, data) => Promise.resolve(data)),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: unknown) => Promise<unknown>) =>
          cb(manager),
        ),
    };
    const refundRequestRepo = {
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };
    const paymentsService = {
      createRefund: jest.fn(),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const mailService = {
      sendRefundRequestReceived: jest.fn(),
      sendRefundRequestApproved: jest.fn(),
      sendRefundRequestRejected: jest.fn(),
    };

    const service = new RefundRequestsService(
      refundRequestRepo as never,
      dataSource as never,
      paymentsService as never,
      usersService as never,
      mailService as never,
    );

    return {
      service,
      manager,
      dataSource,
      refundRequestRepo,
      paymentsService,
      usersService,
      mailService,
    };
  };

  const pendingRequest = () => ({
    id: 'rr-1',
    payment_id: 'payment-1',
    reason: 'wrong size',
    status: RefundRequestStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    adminNote: null,
    refund_id: null,
    requested_by: 'user-1',
    amount: 50,
    items: [{ order_item_id: 'item-1', quantity: 1 }],
  });

  describe('approve', () => {
    it('locks the row, approves, and attaches the refund id', async () => {
      const { service, manager, paymentsService, refundRequestRepo } =
        buildService();
      manager.query.mockResolvedValueOnce([{ id: 'rr-1' }]);
      manager.findOne.mockResolvedValueOnce(pendingRequest());
      paymentsService.createRefund.mockResolvedValueOnce({ id: 'refund-1' });

      const result = await service.approve('rr-1', 'admin-1', {
        note: 'looks good',
      });

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['rr-1'],
      );
      expect(result.status).toBe(RefundRequestStatus.APPROVED);
      expect(result.refund_id).toBe('refund-1');
      expect(paymentsService.createRefund).toHaveBeenCalledWith(
        'payment-1',
        {
          items: [{ order_item_id: 'item-1', quantity: 1 }],
          reason: 'wrong size',
        },
        'admin-1',
      );
      expect(refundRequestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ refund_id: 'refund-1' }),
      );
    });

    it('rejects when the locked row is no longer PENDING (closes the double-approve/approve-vs-reject race)', async () => {
      const { service, manager, paymentsService } = buildService();
      manager.query.mockResolvedValueOnce([{ id: 'rr-1' }]);
      manager.findOne.mockResolvedValueOnce({
        ...pendingRequest(),
        status: RefundRequestStatus.REJECTED,
      });

      await expect(service.approve('rr-1', 'admin-1', {})).rejects.toThrow(
        'Cannot approve a refund request with status "rejected"',
      );
      expect(paymentsService.createRefund).not.toHaveBeenCalled();
    });

    it('reverts the request back to PENDING when createRefund fails, instead of leaving it stuck APPROVED', async () => {
      const { service, manager, paymentsService, refundRequestRepo } =
        buildService();
      manager.query.mockResolvedValueOnce([{ id: 'rr-1' }]);
      manager.findOne.mockResolvedValueOnce(pendingRequest());
      paymentsService.createRefund.mockRejectedValueOnce(
        new Error('gateway down'),
      );

      await expect(service.approve('rr-1', 'admin-1', {})).rejects.toThrow(
        'gateway down',
      );

      expect(refundRequestRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: RefundRequestStatus.PENDING,
          reviewedBy: null,
          reviewedAt: null,
          adminNote: null,
        }),
      );
    });

    it('throws NotFoundException when the row does not exist', async () => {
      const { service, manager } = buildService();
      manager.query.mockResolvedValueOnce([]);

      await expect(service.approve('missing', 'admin-1', {})).rejects.toThrow(
        'Refund request not found',
      );
    });
  });

  describe('reject', () => {
    it('locks the row and rejects it', async () => {
      const { service, manager } = buildService();
      manager.query.mockResolvedValueOnce([{ id: 'rr-1' }]);
      manager.findOne.mockResolvedValueOnce(pendingRequest());

      const result = await service.reject('rr-1', 'admin-1', {
        note: 'not eligible',
      });

      expect(result.status).toBe(RefundRequestStatus.REJECTED);
      expect(result.adminNote).toBe('not eligible');
    });

    it('rejects when the locked row is no longer PENDING', async () => {
      const { service, manager } = buildService();
      manager.query.mockResolvedValueOnce([{ id: 'rr-1' }]);
      manager.findOne.mockResolvedValueOnce({
        ...pendingRequest(),
        status: RefundRequestStatus.APPROVED,
      });

      await expect(
        service.reject('rr-1', 'admin-1', { note: 'too late' }),
      ).rejects.toThrow(
        'Cannot reject a refund request with status "approved"',
      );
    });
  });
});
