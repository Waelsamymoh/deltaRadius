import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AdminRole } from '../../database/entities/admin-user.entity';

/**
 * Allows the request when:
 *   - the user is OWNER (implicit full access), or
 *   - the user is OWNER_ASSISTANT and has ANY of the @RequirePermissions(...) keys.
 * Other roles are rejected. If no @RequirePermissions metadata is set, this
 * guard is a no-op (pass-through).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException();
    if (user.role === AdminRole.OWNER) return true;
    if (user.role === AdminRole.OWNER_ASSISTANT) {
      const have: string[] = user.permissions ?? [];
      if (required.some(k => have.includes(k))) return true;
    }
    throw new ForbiddenException('ليس لديك صلاحية للوصول لهذا المورد');
  }
}
