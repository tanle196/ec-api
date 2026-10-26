import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Identity } from '../entities/identity.entity';

// Business rules for authentication flows. Credential/token verification,
// lookups and token issuing stay in AuthService; this class decides whether
// an account may log in, be activated, reset its password or enter the
// admin area.
@Injectable()
export class AuthPolicy {
  private static readonly ADMIN_ROLES = ['super-admin', 'admin'];

  assertAdminRole(roles: string[]): void {
    if (!roles.some((role) => AuthPolicy.ADMIN_ROLES.includes(role))) {
      throw new ForbiddenException(
        'Tài khoản không có quyền truy cập trang quản trị',
      );
    }
  }

  assertCanLogin(identity: Pick<Identity, 'isActive'>): void {
    if (!identity.isActive) {
      throw new UnauthorizedException('Account is not activated');
    }
  }

  assertCanActivate(
    identity: Pick<Identity, 'isActive' | 'verificationTokenExpires'>,
    now: Date = new Date(),
  ): void {
    if (identity.isActive) {
      throw new BadRequestException('Account is already active');
    }
    if (
      identity.verificationTokenExpires &&
      identity.verificationTokenExpires < now
    ) {
      throw new BadRequestException('Token has expired');
    }
  }

  // Password reset by email only applies to accounts with a local
  // (email/password) identity, not ones registered via an OAuth provider.
  assertHasLocalIdentity(
    identity: Identity | undefined,
  ): asserts identity is Identity {
    if (!identity) {
      throw new BadRequestException(
        'This account is registered using Google/Facebook. Please log in with that provider.',
      );
    }
  }

  assertCanResetPassword(
    identity: Pick<Identity, 'isActive' | 'resetTokenExpires'>,
    now: Date = new Date(),
  ): void {
    if (!identity.resetTokenExpires || identity.resetTokenExpires < now) {
      throw new BadRequestException('Invalid or expired token');
    }
    if (!identity.isActive) {
      throw new BadRequestException('Account is not activated');
    }
  }
}
