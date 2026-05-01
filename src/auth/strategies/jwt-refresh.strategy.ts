import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TypedConfigService } from '@/config/TypedConfigService';
import { CurrentUser } from '@/common/interfaces/current-user.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: TypedConfigService) {
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

  validate(payload: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
    jti: string;
  }): CurrentUser {
    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      refreshJti: payload.jti,
    };
  }
}
