import { AuthPolicy } from './policies/auth.policy';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import crypto from 'node:crypto';
import { AuthService } from './auth.service';
import { AuthProvider } from './enums/AuthProvider';

jest.mock('argon2', () => ({
  hash: jest.fn((p: string) => Promise.resolve(`hashed:${p}`)),
  verify: jest.fn((hash: string, p: string) =>
    Promise.resolve(hash === `hashed:${p}`),
  ),
}));

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

describe('AuthService', () => {
  const GENERIC_REGISTER_MESSAGE =
    'If this email is not yet registered, a verification link has been sent.';

  const buildService = () => {
    const configService = {
      getJwtConfig: () => ({
        accessSecret: 'access-secret',
        accessExpiresIn: '15m',
        refreshSecret: 'refresh-secret',
        refreshExpiresIn: '7d',
      }),
      getAppConfig: () => ({ appDomain: 'https://shop.test' }),
    };
    const jwtService = {
      signAsync: jest
        .fn()
        .mockImplementation((_payload, opts: { secret: string }) =>
          Promise.resolve(`token:${opts.secret}`),
        ),
    };
    const mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendForgotPassword: jest.fn().mockResolvedValue(undefined),
    };
    const userService = {
      getUserProfile: jest.fn().mockResolvedValue({
        email: 'a@example.com',
        roles: ['customer'],
        permissions: ['order:read'],
      }),
      findByEmail: jest.fn(),
    };

    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    const identityRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    // Transactional repos, keyed by entity name.
    const txUserQb = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const txUserRepo = {
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve({ id: 'new-user', ...d })),
      createQueryBuilder: jest.fn().mockReturnValue(txUserQb),
    };
    const txIdentityRepo = {
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'User' ? txUserRepo : txIdentityRepo,
      ),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    const service = new AuthService(
      configService as never,
      jwtService as never,
      mailService as never,
      userService as never,
      dataSource as never,
      identityRepository as never,
      new AuthPolicy(),
    );

    return {
      service,
      jwtService,
      mailService,
      userService,
      identityRepository,
      queryBuilder,
      dataSource,
      txUserRepo,
      txUserQb,
      txIdentityRepo,
    };
  };

  // Flush the fire-and-forget `void notifyVerificationEmail(...)` promise.
  const flush = () => new Promise((r) => setImmediate(r));

  beforeEach(() => jest.clearAllMocks());

  describe('password helpers', () => {
    it('hashes with argon2', async () => {
      const { service } = buildService();

      await expect(service.hashedPassword('secret')).resolves.toBe(
        'hashed:secret',
      );
    });

    it('verifies against the stored hash', async () => {
      const { service } = buildService();

      await expect(
        service.verifiedPassword('secret', 'hashed:secret'),
      ).resolves.toBe(true);
      await expect(
        service.verifiedPassword('wrong', 'hashed:secret'),
      ).resolves.toBe(false);
    });

    it('returns false without calling argon2 when there is no stored hash', async () => {
      const { service } = buildService();

      await expect(service.verifiedPassword('secret')).resolves.toBe(false);
      expect(argon2.verify).not.toHaveBeenCalled();
    });
  });

  describe('generateTokens', () => {
    it('signs access and refresh tokens and stores only the hashed jti', async () => {
      const { service, jwtService, identityRepository } = buildService();

      const result = await service.generateTokens({ id: 'user-1' });

      expect(result).toEqual({
        accessToken: 'token:access-secret',
        refreshToken: 'token:refresh-secret',
      });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        {
          sub: 'user-1',
          email: 'a@example.com',
          roles: ['customer'],
          permissions: ['order:read'],
        },
        { secret: 'access-secret', expiresIn: '15m' },
      );

      const [refreshPayload, refreshOpts] = jwtService.signAsync.mock
        .calls[1] as [{ jti: string }, object];
      expect(refreshOpts).toEqual({
        secret: 'refresh-secret',
        expiresIn: '7d',
      });
      expect(refreshPayload.jti).toMatch(/^[a-f0-9]{64}$/);
      expect(identityRepository.update).toHaveBeenCalledWith(
        { user: { id: 'user-1' }, provider: AuthProvider.LOCAL },
        { refreshToken: sha256(refreshPayload.jti) },
      );
    });
  });

  describe('adminLogin', () => {
    it.each(['admin', 'super-admin'])('allows %s', async (role) => {
      const { service, userService } = buildService();
      userService.getUserProfile.mockResolvedValue({ roles: [role] });

      await expect(service.adminLogin({ id: 'user-1' })).resolves.toEqual(
        expect.objectContaining({
          accessToken: expect.any(String) as unknown,
        }),
      );
    });

    it('rejects non-admin users', async () => {
      const { service, jwtService } = buildService();

      await expect(service.adminLogin({ id: 'user-1' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a missing profile', async () => {
      const { service, userService } = buildService();
      userService.getUserProfile.mockResolvedValue(null);

      await expect(service.adminLogin({ id: 'user-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('rotateRefreshToken', () => {
    it('invalidates the used token and issues a new pair', async () => {
      const { service, identityRepository } = buildService();
      const identity = { id: 'identity-1', refreshToken: sha256('jti-1') };
      identityRepository.findOne.mockResolvedValue(identity);

      const result = await service.rotateRefreshToken('user-1', 'jti-1');

      expect(identityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: null }),
      );
      expect(result.refreshToken).toBe('token:refresh-secret');
    });

    it('rejects a reused/unknown jti', async () => {
      const { service, identityRepository, jwtService } = buildService();
      identityRepository.findOne.mockResolvedValue({
        refreshToken: sha256('other'),
      });

      await expect(
        service.rotateRefreshToken('user-1', 'jti-1'),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejects when there is no local identity', async () => {
      const { service, identityRepository } = buildService();
      identityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rotateRefreshToken('user-1', 'jti-1'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateLocalUser', () => {
    const identity = {
      id: 'identity-1',
      passwordHash: 'hashed:secret',
      isActive: true,
      user: { id: 'user-1', email: 'a@example.com', fullName: 'A' },
    };

    it('returns user info for valid credentials', async () => {
      const { service, queryBuilder } = buildService();
      queryBuilder.getOne.mockResolvedValue(identity);

      await expect(
        service.validateLocalUser('a@example.com', 'secret'),
      ).resolves.toEqual({
        id: 'user-1',
        email: 'a@example.com',
        fullName: 'A',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'identity.providerUserId = :email',
        { email: 'a@example.com' },
      );
    });

    it.each([
      ['unknown email', null, 'Invalid credentials'],
      [
        'identity without user',
        { ...identity, user: null },
        'Invalid credentials',
      ],
      [
        'inactive account',
        { ...identity, isActive: false },
        'Account is not activated',
      ],
      [
        'no password hash',
        { ...identity, passwordHash: null },
        'Invalid credentials',
      ],
    ])('rejects %s', async (_label, found, message) => {
      const { service, queryBuilder } = buildService();
      queryBuilder.getOne.mockResolvedValue(found);

      await expect(
        service.validateLocalUser('a@example.com', 'secret'),
      ).rejects.toThrow(new UnauthorizedException(message));
    });

    it('rejects a wrong password', async () => {
      const { service, queryBuilder } = buildService();
      queryBuilder.getOne.mockResolvedValue(identity);

      await expect(
        service.validateLocalUser('a@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateOAuthLogin', () => {
    it('returns the linked user for an existing active identity', async () => {
      const { service, queryBuilder, dataSource } = buildService();
      queryBuilder.getOne.mockResolvedValue({
        isActive: true,
        user: { id: 'user-1', email: 'a@example.com', fullName: 'A' },
      });

      await expect(
        service.validateOAuthLogin(AuthProvider.GOOGLE, 'g-1'),
      ).resolves.toEqual({
        id: 'user-1',
        email: 'a@example.com',
        fullName: 'A',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive identity', async () => {
      const { service, queryBuilder } = buildService();
      queryBuilder.getOne.mockResolvedValue({ isActive: false, user: {} });

      await expect(
        service.validateOAuthLogin(AuthProvider.GOOGLE, 'g-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('requires an email to create a new identity', async () => {
      const { service, queryBuilder } = buildService();
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.validateOAuthLogin(AuthProvider.GOOGLE, 'g-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new user and identity when the email is unknown', async () => {
      const { service, queryBuilder, txUserRepo, txIdentityRepo } =
        buildService();
      queryBuilder.getOne.mockResolvedValue(null);

      const result = await service.validateOAuthLogin(
        AuthProvider.GOOGLE,
        'g-1',
        'new@example.com',
      );

      expect(txUserRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        userCode: expect.stringMatching(/^USR-/) as unknown,
      });
      expect(txIdentityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: AuthProvider.GOOGLE,
          providerUserId: 'g-1',
          isActive: true,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'new-user', email: 'new@example.com' }),
      );
    });

    it('links a new identity to an existing user with the same email', async () => {
      const { service, queryBuilder, txUserQb, txUserRepo, txIdentityRepo } =
        buildService();
      queryBuilder.getOne.mockResolvedValue(null);
      const existing = { id: 'user-1', email: 'a@example.com', fullName: 'A' };
      txUserQb.getOne.mockResolvedValue(existing);

      const result = await service.validateOAuthLogin(
        AuthProvider.GOOGLE,
        'g-1',
        'a@example.com',
      );

      expect(txUserRepo.save).not.toHaveBeenCalled();
      expect(txIdentityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: existing }),
      );
      expect(result.id).toBe('user-1');
    });
  });

  describe('register', () => {
    it('creates a user + inactive local identity and sends a verification email', async () => {
      const { service, userService, txIdentityRepo, mailService } =
        buildService();
      userService.findByEmail.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@example.com',
        password: 'secret',
      });
      await flush();

      expect(result).toEqual({ message: GENERIC_REGISTER_MESSAGE });
      const identity = txIdentityRepo.save.mock.calls[0][0] as {
        verificationToken: string;
        verificationTokenExpires: Date;
        passwordHash: string;
        provider: AuthProvider;
      };
      expect(identity.provider).toBe(AuthProvider.LOCAL);
      expect(identity.passwordHash).toBe('hashed:secret');
      expect(identity.verificationTokenExpires.getTime()).toBeGreaterThan(
        Date.now(),
      );

      const [email, url] = mailService.sendVerificationEmail.mock.calls[0] as [
        string,
        string,
      ];
      expect(email).toBe('new@example.com');
      const token = new URL(url).searchParams.get('token')!;
      expect(url.startsWith('https://shop.test/verify-email?token=')).toBe(
        true,
      );
      // Only the hash is persisted, never the raw token.
      expect(identity.verificationToken).toBe(sha256(token));
    });

    it('does nothing for an already-active account but returns the same message', async () => {
      const { service, userService, identityRepository, mailService } =
        buildService();
      userService.findByEmail.mockResolvedValue({
        identities: [{ provider: AuthProvider.LOCAL, isActive: true }],
      });

      await expect(
        service.register({ email: 'a@example.com', password: 'x' }),
      ).resolves.toEqual({ message: GENERIC_REGISTER_MESSAGE });
      await flush();
      expect(identityRepository.update).not.toHaveBeenCalled();
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('does not resend while an inactive account still has a valid token', async () => {
      const { service, userService, identityRepository } = buildService();
      userService.findByEmail.mockResolvedValue({
        identities: [
          {
            provider: AuthProvider.LOCAL,
            isActive: false,
            verificationTokenExpires: new Date(Date.now() + 60_000),
          },
        ],
      });

      await service.register({
        email: 'a@example.com',
        password: 'x',
      });

      expect(identityRepository.update).not.toHaveBeenCalled();
    });

    it('reissues the token and password for an inactive account with an expired token', async () => {
      const { service, userService, identityRepository, mailService } =
        buildService();
      userService.findByEmail.mockResolvedValue({
        identities: [
          {
            id: 'identity-1',
            provider: AuthProvider.LOCAL,
            isActive: false,
            verificationTokenExpires: new Date(Date.now() - 60_000),
          },
        ],
      });

      await service.register({
        email: 'a@example.com',
        password: 'new',
      });
      await flush();

      expect(identityRepository.update).toHaveBeenCalledWith(
        'identity-1',
        expect.objectContaining({
          passwordHash: 'hashed:new',
          verificationToken: expect.any(String) as unknown,
          verificationTokenExpires: expect.any(Date) as unknown,
        }),
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('still returns the generic message when something fails', async () => {
      const { service, userService } = buildService();
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      userService.findByEmail.mockRejectedValue(new Error('db down'));

      await expect(
        service.register({ email: 'a@example.com', password: 'x' }),
      ).resolves.toEqual({ message: GENERIC_REGISTER_MESSAGE });
    });

    it('swallows mail failures', async () => {
      const { service, userService, mailService } = buildService();
      userService.findByEmail.mockResolvedValue(null);
      mailService.sendVerificationEmail.mockRejectedValue(new Error('smtp'));
      const logger = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.register({
        email: 'a@example.com',
        password: 'x',
      });
      await flush();

      expect(logger).toHaveBeenCalled();
    });
  });

  describe('activeAccount', () => {
    const user = { id: 'user-1', email: 'a@example.com', fullName: 'A' };

    it('activates and clears the verification token', async () => {
      const { service, identityRepository } = buildService();
      identityRepository.findOne.mockResolvedValue({
        isActive: false,
        verificationToken: sha256('tok'),
        verificationTokenExpires: new Date(Date.now() + 60_000),
        user,
      });

      await expect(service.activeAccount('tok')).resolves.toEqual(user);
      expect(identityRepository.findOne).toHaveBeenCalledWith({
        where: { verificationToken: sha256('tok') },
        relations: ['user'],
      });
      expect(identityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          verificationToken: null,
          verificationTokenExpires: null,
        }),
      );
    });

    it.each([
      ['unknown token', null, 'Invalid token'],
      ['already active', { isActive: true, user }, 'Account is already active'],
      [
        'expired token',
        { isActive: false, verificationTokenExpires: new Date(0), user },
        'Token has expired',
      ],
    ])('rejects %s', async (_label, found, message) => {
      const { service, identityRepository } = buildService();
      identityRepository.findOne.mockResolvedValue(found);

      await expect(service.activeAccount('tok')).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(identityRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('silently returns for an unknown email', async () => {
      const { service, userService, mailService } = buildService();
      userService.findByEmail.mockResolvedValue(null);

      await expect(service.forgotPassword('x@example.com')).resolves.toBe(
        undefined,
      );
      expect(mailService.sendForgotPassword).not.toHaveBeenCalled();
    });

    it('rejects OAuth-only accounts', async () => {
      const { service, userService } = buildService();
      userService.findByEmail.mockResolvedValue({
        identities: [{ provider: AuthProvider.GOOGLE }],
      });

      await expect(service.forgotPassword('a@example.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('stores a hashed reset token (15 min) and emails the raw one', async () => {
      const { service, userService, identityRepository, mailService } =
        buildService();
      const identity = { provider: AuthProvider.LOCAL } as {
        provider: AuthProvider;
        resetToken?: string;
        resetTokenExpires?: Date;
      };
      userService.findByEmail.mockResolvedValue({ identities: [identity] });

      await service.forgotPassword('a@example.com');

      const [, url] = mailService.sendForgotPassword.mock.calls[0] as [
        string,
        string,
      ];
      const token = new URL(url).searchParams.get('token')!;
      expect(url.startsWith('https://shop.test/reset-password?token=')).toBe(
        true,
      );
      expect(identityRepository.save).toHaveBeenCalledWith(identity);
      expect(identity.resetToken).toBe(sha256(token));
      const ttl = identity.resetTokenExpires!.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(14 * 60_000);
      expect(ttl).toBeLessThanOrEqual(15 * 60_000);
    });
  });

  describe('resetPassword', () => {
    it('sets the new password and clears the reset token', async () => {
      const { service, identityRepository } = buildService();
      identityRepository.findOne.mockResolvedValue({
        isActive: true,
        resetToken: sha256('tok'),
        resetTokenExpires: new Date(Date.now() + 60_000),
      });

      await service.resetPassword('new-pass', 'tok');

      expect(identityRepository.findOne).toHaveBeenCalledWith({
        where: { resetToken: sha256('tok') },
      });
      expect(identityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: 'hashed:new-pass',
          resetToken: null,
          resetTokenExpires: null,
        }),
      );
    });

    it.each([
      ['unknown token', null, 'Invalid or expired token'],
      [
        'missing expiry',
        { isActive: true, resetTokenExpires: null },
        'Invalid or expired token',
      ],
      [
        'expired token',
        { isActive: true, resetTokenExpires: new Date(0) },
        'Invalid or expired token',
      ],
      [
        'inactive account',
        { isActive: false, resetTokenExpires: new Date(Date.now() + 60_000) },
        'Account is not activated',
      ],
    ])('rejects %s', async (_label, found, message) => {
      const { service, identityRepository } = buildService();
      identityRepository.findOne.mockResolvedValue(found);

      await expect(service.resetPassword('new', 'tok')).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(identityRepository.save).not.toHaveBeenCalled();
    });
  });
});
