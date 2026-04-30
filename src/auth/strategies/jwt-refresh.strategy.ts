import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TypedConfigService } from '@/config/TypedConfigService';
import { CurrentUser } from '@/common/interfaces/current-user.interface';
import { UsersService } from '@/users/users.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: TypedConfigService,
    private usersService: UsersService,
  ) {
    const jwtConfig = configService.getJwtConfig();
    const ExtractJwtTyped = ExtractJwt as {
      fromAuthHeaderAsBearerToken: () => (req: any) => string | null;
    };
    const tokenExtractor = ExtractJwtTyped.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest: tokenExtractor,
      ignoreExpiration: false,
      secretOrKey: jwtConfig.refreshSecret,
    });
  }

  async validate(payload: {
    sub: string;
    roles: string[];
    permissions: string[];
  }): Promise<CurrentUser> {
    const { roles, permissions, sub } = payload;
    const user = await this.usersService.findById(sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    const { email, fullName, avatar } = user;
    return { id: sub, email, fullName, avatar, roles, permissions };
  }
}
