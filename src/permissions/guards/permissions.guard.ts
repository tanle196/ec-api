import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from '@/common/interfaces/current-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUser }>();
    if (!user) return false;

    return requiredPermissions.some((p) => user.permissions?.includes(p));
  }
}
