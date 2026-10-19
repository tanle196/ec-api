import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Identity } from '../entities/identity.entity';
import { AuthPolicy } from './auth.policy';

describe('AuthPolicy', () => {
  const policy = new AuthPolicy();
  const now = new Date('2026-01-15T00:00:00Z');
  const past = new Date('2026-01-14T00:00:00Z');
  const future = new Date('2026-01-16T00:00:00Z');

  it('assertAdminRole throws for non-admin roles only', () => {
    expect(() => policy.assertAdminRole(['admin'])).not.toThrow();
    expect(() => policy.assertAdminRole(['super-admin'])).not.toThrow();
    expect(() => policy.assertAdminRole(['customer'])).toThrow(
      ForbiddenException,
    );
    expect(() => policy.assertAdminRole([])).toThrow(ForbiddenException);
  });

  it('assertCanLogin rejects inactive accounts', () => {
    expect(() => policy.assertCanLogin({ isActive: true })).not.toThrow();
    expect(() => policy.assertCanLogin({ isActive: false })).toThrow(
      UnauthorizedException,
    );
  });

  describe('assertCanActivate', () => {
    it('allows an inactive account with a valid token', () => {
      expect(() =>
        policy.assertCanActivate(
          { isActive: false, verificationTokenExpires: future },
          now,
        ),
      ).not.toThrow();
    });

    it('rejects an already active account', () => {
      expect(() =>
        policy.assertCanActivate(
          { isActive: true, verificationTokenExpires: future },
          now,
        ),
      ).toThrow('Account is already active');
    });

    it('rejects an expired token', () => {
      expect(() =>
        policy.assertCanActivate(
          { isActive: false, verificationTokenExpires: past },
          now,
        ),
      ).toThrow('Token has expired');
    });
  });

  it('assertHasLocalIdentity rejects OAuth-only accounts', () => {
    expect(() =>
      policy.assertHasLocalIdentity({ id: 'i-1' } as Identity),
    ).not.toThrow();
    expect(() => policy.assertHasLocalIdentity(undefined)).toThrow(
      BadRequestException,
    );
  });

  describe('assertCanResetPassword', () => {
    it('allows an active account with a valid token', () => {
      expect(() =>
        policy.assertCanResetPassword(
          { isActive: true, resetTokenExpires: future },
          now,
        ),
      ).not.toThrow();
    });

    it('rejects a missing or expired token', () => {
      expect(() =>
        policy.assertCanResetPassword(
          { isActive: true, resetTokenExpires: null },
          now,
        ),
      ).toThrow('Invalid or expired token');
      expect(() =>
        policy.assertCanResetPassword(
          { isActive: true, resetTokenExpires: past },
          now,
        ),
      ).toThrow('Invalid or expired token');
    });

    it('rejects an inactive account', () => {
      expect(() =>
        policy.assertCanResetPassword(
          { isActive: false, resetTokenExpires: future },
          now,
        ),
      ).toThrow('Account is not activated');
    });
  });
});
