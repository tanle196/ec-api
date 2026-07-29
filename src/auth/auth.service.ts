import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import crypto from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { RegisterDto } from './dtos/register.dto';
import { Identity } from './entities/identity.entity';
import { AuthProvider } from './enums/AuthProvider';
import { UserInformationResponseDto } from './dtos/user-response.dto';
import { MessageResponseDto } from './dtos/message-response.dto';
import { User } from '@/users/entities/user.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { MailService } from '@/mail/mail.service';
import { UsersService } from '@/users/users.service';
import { generateUserCode } from '@/users/utils/user-code.util';

const ADMIN_ROLES = ['super-admin', 'admin'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: TypedConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly userService: UsersService,
    private readonly dataSource: DataSource,
    @InjectRepository(Identity)
    private readonly identityRepository: Repository<Identity>,
  ) {}

  async hashedPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifiedPassword(
    plainPassword: string,
    storedPassword?: string,
  ): Promise<boolean> {
    if (!storedPassword) return false;
    return argon2.verify(storedPassword, plainPassword);
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async generateTokens({
    id,
  }: {
    id: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const userProfile = await this.userService.getUserProfile(id);
    const payload = {
      sub: id,
      email: userProfile?.email,
      roles: userProfile?.roles,
      permissions: userProfile?.permissions,
    };
    const jwtConfig = this.configService.getJwtConfig();

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessExpiresIn,
    });

    const rawRefreshToken = this.generateToken();
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: rawRefreshToken },
      {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiresIn,
      },
    );

    const refreshTokenHash = this.hashToken(rawRefreshToken);
    await this.identityRepository.update(
      { user: { id }, provider: AuthProvider.LOCAL },
      { refreshToken: refreshTokenHash },
    );

    return { accessToken, refreshToken };
  }

  async adminLogin({
    id,
  }: {
    id: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const userProfile = await this.userService.getUserProfile(id);
    if (!userProfile?.roles.some((role) => ADMIN_ROLES.includes(role))) {
      throw new ForbiddenException(
        'Tài khoản không có quyền truy cập trang quản trị',
      );
    }

    return this.generateTokens({ id });
  }

  assertAdminRole(roles: string[]): void {
    if (!roles.some((role) => ADMIN_ROLES.includes(role))) {
      throw new ForbiddenException(
        'Tài khoản không có quyền truy cập trang quản trị',
      );
    }
  }

  async rotateRefreshToken(
    userId: string,
    rawJti: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jtiHash = this.hashToken(rawJti);
    const identity = await this.identityRepository.findOne({
      where: { user: { id: userId }, provider: AuthProvider.LOCAL },
    });

    if (!identity || identity.refreshToken !== jtiHash) {
      throw new UnauthorizedException(
        'Refresh token is invalid or already used',
      );
    }

    identity.refreshToken = null;
    await this.identityRepository.save(identity);

    return this.generateTokens({ id: userId });
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<UserInformationResponseDto> {
    const identity = await this.identityRepository
      .createQueryBuilder('identity')
      .leftJoinAndSelect('identity.user', 'user')
      .where('identity.provider = :provider', { provider: AuthProvider.LOCAL })
      .andWhere('identity.providerUserId = :email', { email })
      .select([
        'identity.id',
        'identity.passwordHash',
        'identity.isActive',
        'user.id',
        'user.email',
        'user.fullName',
      ])
      .getOne();

    if (!identity || !identity.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!identity.isActive) {
      throw new UnauthorizedException('Account is not activated');
    }

    if (!identity.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatched = await this.verifiedPassword(
      password,
      identity.passwordHash,
    );
    if (!isMatched) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: identity.user.id,
      email: identity.user.email,
      fullName: identity.user.fullName,
    };
  }

  async validateOAuthLogin(
    provider: AuthProvider,
    providerUserId: string,
    email?: string,
  ): Promise<UserInformationResponseDto> {
    const identity = await this.identityRepository
      .createQueryBuilder('identity')
      .leftJoinAndSelect('identity.user', 'user')
      .where('identity.provider = :provider', { provider })
      .andWhere('identity.providerUserId = :providerUserId', { providerUserId })
      .select([
        'identity.id',
        'identity.isActive',
        'user.id',
        'user.email',
        'user.fullName',
      ])
      .getOne();

    if (identity) {
      if (!identity.isActive) {
        throw new UnauthorizedException('Account is not activated');
      }
      return {
        id: identity.user.id,
        email: identity.user.email,
        fullName: identity.user.fullName,
      };
    }

    if (!email) {
      throw new BadRequestException('Email is required for OAuth login');
    }

    const user = await this.dataSource.transaction(async (manager) => {
      let newUser = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.email = :email', { email })
        .select(['user.id', 'user.email', 'user.fullName', 'user.avatar'])
        .getOne();

      if (!newUser) {
        newUser = manager
          .getRepository(User)
          .create({ email, userCode: generateUserCode() });
        newUser = await manager.getRepository(User).save(newUser);
      }

      const newIdentity = manager.getRepository(Identity).create({
        provider,
        providerUserId,
        isActive: true,
        user: newUser,
      });
      await manager.getRepository(Identity).save(newIdentity);

      return newUser;
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    };
  }

  async register({
    email,
    password,
  }: RegisterDto): Promise<MessageResponseDto> {
    try {
      const existing = await this.userService.findByEmail(email);
      if (existing) {
        const localIdentity = existing.identities?.find(
          (i) => i.provider === AuthProvider.LOCAL,
        );

        const isExpired =
          localIdentity &&
          !localIdentity.isActive &&
          (!localIdentity.verificationTokenExpires ||
            localIdentity.verificationTokenExpires < new Date());

        if (isExpired) {
          const { token, tokenHash, expires } = this.createVerificationToken();
          const passwordHash = await this.hashedPassword(password);
          await this.identityRepository.update(localIdentity.id, {
            verificationToken: tokenHash,
            verificationTokenExpires: expires,
            passwordHash,
          });
          void this.notifyVerificationEmail(email, token);
        }

        return {
          message:
            'If this email is not yet registered, a verification link has been sent.',
        };
      }

      const { token, tokenHash, expires } = this.createVerificationToken();
      const passwordHash = await this.hashedPassword(password);

      await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const identityRepo = manager.getRepository(Identity);

        const newUser = await userRepo.save(
          userRepo.create({ email, userCode: generateUserCode() }),
        );

        await identityRepo.save(
          identityRepo.create({
            provider: AuthProvider.LOCAL,
            providerUserId: email,
            passwordHash,
            user: newUser,
            verificationToken: tokenHash,
            verificationTokenExpires: expires,
          }),
        );
      });

      void this.notifyVerificationEmail(email, token);

      return {
        message:
          'If this email is not yet registered, a verification link has been sent.',
      };
    } catch (error) {
      console.log(error);
      return {
        message:
          'If this email is not yet registered, a verification link has been sent.',
      };
    }
  }

  private createVerificationToken(): {
    token: string;
    tokenHash: string;
    expires: Date;
  } {
    const token = this.generateToken();
    return {
      token,
      tokenHash: this.hashToken(token),
      expires: new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  private buildVerifyUrl(token: string): string {
    const { appDomain } = this.configService.getAppConfig();
    return `${appDomain}/verify-email?token=${token}`;
  }

  private async notifyVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    try {
      await this.mailService.sendVerificationEmail(
        email,
        this.buildVerifyUrl(token),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async activeAccount(token: string): Promise<UserInformationResponseDto> {
    const tokenHash = this.hashToken(token);
    const identity = await this.identityRepository.findOne({
      where: { verificationToken: tokenHash },
      relations: ['user'],
    });

    if (!identity) {
      throw new BadRequestException('Invalid token');
    }

    if (identity.isActive) {
      throw new BadRequestException('Account is already active');
    }

    if (
      identity.verificationTokenExpires &&
      identity.verificationTokenExpires < new Date()
    ) {
      throw new BadRequestException('Token has expired');
    }

    identity.verificationToken = null;
    identity.verificationTokenExpires = null;
    identity.isActive = true;
    await this.identityRepository.save(identity);

    return {
      id: identity.user.id,
      email: identity.user.email,
      fullName: identity.user.fullName,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return;
    }

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    const identity = user.identities?.find(
      (i) => i.provider === AuthProvider.LOCAL,
    );

    if (!identity) {
      throw new BadRequestException(
        'This account is registered using Google/Facebook. Please log in with that provider.',
      );
    }

    identity.resetToken = tokenHash;
    identity.resetTokenExpires = expires;
    await this.identityRepository.save(identity);

    const appDomain = this.configService.getAppConfig().appDomain;
    const resetUrl = `${appDomain}/reset-password?token=${token}`;
    await this.mailService.sendForgotPassword(email, resetUrl);
  }

  async resetPassword(newPassword: string, token: string) {
    const tokenHash = this.hashToken(token);
    const identity = await this.identityRepository.findOne({
      where: { resetToken: tokenHash },
    });

    if (
      !identity ||
      !identity.resetTokenExpires ||
      identity.resetTokenExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (!identity.isActive) {
      throw new BadRequestException('Account is not activated');
    }

    identity.passwordHash = await this.hashedPassword(newPassword);
    identity.resetToken = null;
    identity.resetTokenExpires = null;

    await this.identityRepository.save(identity);
  }
}
