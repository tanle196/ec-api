import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentIssueStatus } from './enums/payment-issue-status.enum';
import { PaymentIssueType } from './enums/payment-issue-type.enum';
import { PaymentIssuesService } from './payment-issues.service';

describe('PaymentIssuesService', () => {
  const build = () => {
    const qb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const repo = {
      manager: {
        createQueryBuilder: jest.fn(() => qb),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      },
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      save: jest.fn((d: object) => Promise.resolve(d)),
    };
    return { service: new PaymentIssuesService(repo as never), repo, qb };
  };

  it('inserts an open issue, ignoring a duplicate of one still open', async () => {
    const { service, qb } = build();

    await service.raise({
      type: PaymentIssueType.AMOUNT_MISMATCH,
      summary: 's',
      paymentId: 'p',
    });

    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PaymentIssueType.AMOUNT_MISMATCH,
        status: PaymentIssueStatus.OPEN,
        payment_id: 'p',
        resolvedAt: null,
      }),
    );
    expect(qb.orIgnore).toHaveBeenCalled();
  });

  it('records an automatically handled issue as resolved', async () => {
    const { service, qb } = build();

    await service.raise({
      type: PaymentIssueType.WEBHOOK_MISSED,
      summary: 's',
      resolved: true,
    });

    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PaymentIssueStatus.RESOLVED,
        resolutionNote: 'Handled automatically',
      }),
    );
  });

  it('resolves an open issue with the note and actor', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue({
      id: 'i',
      status: PaymentIssueStatus.OPEN,
    });

    await expect(service.resolve('i', 'admin-1', 'called')).resolves.toEqual(
      expect.objectContaining({
        status: PaymentIssueStatus.RESOLVED,
        resolvedBy: 'admin-1',
        resolutionNote: 'called',
      }),
    );
  });

  it('refuses to resolve twice or a missing issue', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValueOnce({ status: PaymentIssueStatus.RESOLVED });
    await expect(service.resolve('i', 'a', 'n')).rejects.toThrow(
      BadRequestException,
    );
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.resolve('i', 'a', 'n')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('filters the list', async () => {
    const { service, repo } = build();
    await service.findAll({
      status: PaymentIssueStatus.OPEN,
      page: 2,
      limit: 10,
    });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PaymentIssueStatus.OPEN },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('resolveOpen closes only open issues of the given types', async () => {
    const { service, repo } = build();

    await service.resolveOpen(
      'p',
      [PaymentIssueType.COD_AMOUNT_MISMATCH],
      'fixed',
      'admin-1',
    );

    expect(repo.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payment_id: 'p',
        status: PaymentIssueStatus.OPEN,
      }),
      expect.objectContaining({
        status: PaymentIssueStatus.RESOLVED,
        resolvedBy: 'admin-1',
        resolutionNote: 'fixed',
      }),
    );
  });
});
