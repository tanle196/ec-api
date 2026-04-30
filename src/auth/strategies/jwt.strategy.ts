import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TypedConfigService } from '@/config/TypedConfigService';
import { CurrentUser } from '@/common/interfaces/current-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: TypedConfigService) {
    const jwtConfig = configService.getJwtConfig();
    const ExtractJwtTyped = ExtractJwt as {
      fromAuthHeaderAsBearerToken: () => (req: any) => string | null;
    };
    const tokenExtractor = ExtractJwtTyped.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest: tokenExtractor,
      ignoreExpiration: false,
      secretOrKey: jwtConfig.accessSecret,
    });
  }

  validate(payload: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
  }): CurrentUser {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
