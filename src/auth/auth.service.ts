import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import { UserResponseDto } from './dtos/user-response.dto';
import { User } from '@/users/entities/user.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { MailService } from '@/mail/mail.service';
import { UsersService } from '@/users/users.service';

@Injectable()
export class AuthService {
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
    const passwordHash = await argon2.hash(password);
    return passwordHash;
  }

  async verifiedPassword(
    plainPassword: string,
    storedPassword?: string,
  ): Promise<boolean> {
    if (!storedPassword) return false;
    const isMatched = await argon2.verify(storedPassword, plainPassword);
    return isMatched;
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

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: jwtConfig.refreshSecret,
      expiresIn: jwtConfig.refreshExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<UserResponseDto> {
    const identity = await this.identityRepository
      .createQueryBuilder('identity')
      .leftJoinAndSelect('identity.user', 'user')
      .where('identity.provider = :provider', { provider: AuthProvider.LOCAL })
      .andWhere('identity.providerUserId = :email', { email })
      .select([
        'identity.id',
        'identity.passwordHash',
        'user.id',
        'user.email',
        'user.fullName',
      ])
      .getOne();

    if (!identity || !identity.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!identity.passwordHash) {
      throw new UnauthorizedException('Missing password');
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
  ): Promise<UserResponseDto> {
    const identity = await this.identityRepository
      .createQueryBuilder('identity')
      .leftJoinAndSelect('identity.user', 'user')
      .where('identity.provider = :provider', { provider })
      .andWhere('identity.providerUserId = :providerUserId', { providerUserId })
      .select(['identity.id', 'user.id', 'user.email', 'user.fullName'])
      .getOne();

    if (identity) {
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
        newUser = manager.getRepository(User).create({ email });
        newUser = await manager.getRepository(User).save(newUser);
      }

      const newIdentity = manager.getRepository(Identity).create({
        provider,
        providerUserId,
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

  generateToken = () => {
    return crypto.randomBytes(32).toString('hex');
  };

  async register({ email, password }: RegisterDto) {
    const token = this.generateToken();
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    const passwordHash = await this.hashedPassword(password);

    let user: User | null;

    try {
      user = await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const identityRepo = manager.getRepository(Identity);

        const newUser = userRepo.create({ email });
        await userRepo.save(newUser);

        const identity = identityRepo.create({
          provider: AuthProvider.LOCAL,
          providerUserId: email,
          passwordHash,
          user: newUser,
          verificationToken: token,
          verificationTokenExpires: expires,
        });
        await identityRepo.save(identity);

        return newUser; // transaction return
      });
    } catch (error) {
      throw error;
    }

    // gửi mail sau khi transaction commit
    try {
      const appDomain = this.configService.getAppConfig().appDomain;
      const verifyUrl = `${appDomain}/auth/verify-email?token=${token}`;
      void this.mailService.sendVerificationEmail(email, verifyUrl);
    } catch (error) {
      throw error;
    }

    return user;
  }

  async activeAccount(token: string): Promise<User> {
    const identityRepo = this.identityRepository;
    const identity = await identityRepo.findOne({
      where: [{ verificationToken: token }],
      relations: ['user'],
    });

    if (!identity) {
      throw new BadRequestException('Token không hợp lệ');
    }

    if (
      identity.verificationTokenExpires &&
      identity.verificationTokenExpires < new Date()
    ) {
      throw new BadRequestException('Token đã hết hạn');
    }

    identity.verificationToken = null;
    identity.verificationTokenExpires = null;
    identity.isActive = true;
    await identityRepo.save(identity);

    return identity.user;
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new NotFoundException();
    }

    const token = this.generateToken();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

    const identity = user.identities?.find(
      (identity) => identity.provider === AuthProvider.LOCAL,
    );

    if (!identity) {
      throw new BadRequestException(
        'This account is registered using Google/Facebook. Please log in with that provider.',
      );
    }

    identity.resetToken = token;
    identity.resetTokenExpires = expires;
    await this.identityRepository.save(identity);

    const appDomain = this.configService.getAppConfig().appDomain;
    const resetUrl = `${appDomain}/auth/forgot-password?token=${token}`;
    await this.mailService.sendForgotPassword(email, resetUrl);
  }

  async resetPassword(newPassword: string, token: string) {
    const identity = await this.identityRepository.findOne({
      where: [{ resetToken: token }],
    });
    if (
      !identity ||
      !identity.resetTokenExpires ||
      identity.resetTokenExpires < new Date()
    ) {
      throw new BadRequestException('Token không hợp lệ');
    }

    identity.passwordHash = await this.hashedPassword(newPassword);
    identity.resetToken = null;
    identity.resetTokenExpires = null;

    await this.identityRepository.save(identity);
  }
}
