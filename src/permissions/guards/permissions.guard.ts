import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@/users/entities/user.entity';
import { Permission } from '@/permissions/entities/permission.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<Permission[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    return requiredPermissions.some((p) => user?.permissions?.includes(p));
  }
}
