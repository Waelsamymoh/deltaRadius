import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AdminRole } from '../../database/entities/admin-user.entity';

// Maps (method, path-prefix) → required permission.
// Order matters: first match wins. Use '*' for any method.
const ROUTE_PERMISSIONS: { method: string; prefix: string; perm: string }[] = [
  { method: 'GET',    prefix: '/accounting/dashboard', perm: 'dashboard' },
  { method: 'GET',    prefix: '/accounting',           perm: 'accounting.view' },

  { method: 'DELETE', prefix: '/radius-users',         perm: 'users.delete' },
  { method: 'POST',   prefix: '/radius-users',         perm: 'users.create' },  // kick also POST
  { method: 'PATCH',  prefix: '/radius-users',         perm: 'users.edit' },
  { method: 'GET',    prefix: '/radius-users',         perm: 'users.view' },

  { method: 'DELETE', prefix: '/voucher-cards',        perm: 'cards.delete' },
  { method: 'POST',   prefix: '/voucher-cards',        perm: 'cards.create' },
  { method: 'PATCH',  prefix: '/voucher-cards',        perm: 'cards.edit' },
  { method: 'GET',    prefix: '/voucher-cards',        perm: 'cards.view' },

  { method: 'DELETE', prefix: '/plans',                perm: 'plans.delete' },
  { method: 'POST',   prefix: '/plans',                perm: 'plans.create' },
  { method: 'PATCH',  prefix: '/plans',                perm: 'plans.edit' },
  { method: 'GET',    prefix: '/plans',                perm: 'plans.view' },

  { method: 'GET',    prefix: '/nas',                  perm: 'nas.view' },
  { method: '*',      prefix: '/nas',                  perm: 'nas.manage' },

  { method: 'GET',    prefix: '/topup-packages',       perm: 'topups.view' },
  { method: '*',      prefix: '/topup-packages',       perm: 'topups.manage' },

  { method: 'GET',    prefix: '/groups',               perm: 'groups.view' },
  { method: '*',      prefix: '/groups',               perm: 'groups.manage' },
];

@Injectable()
export class PermissionsMiddleware implements NestMiddleware {
  use(req: Request & { user?: any }, _res: Response, next: NextFunction) {
    const user = req.user;
    if (!user || user.role !== AdminRole.MODERATOR) return next();

    const permissions: string[] = user.permissions ?? [];
    const path = req.path.replace(/^\/api/, '');
    const method = req.method.toUpperCase();

    for (const rule of ROUTE_PERMISSIONS) {
      if (!path.startsWith(rule.prefix)) continue;
      const methodMatch = rule.method === '*' || rule.method === method;
      if (!methodMatch) continue;

      if (!permissions.includes(rule.perm)) {
        throw new ForbiddenException(`ليس لديك صلاحية: ${rule.perm}`);
      }
      return next();
    }

    next();
  }
}
