import { ForbiddenException } from '@nestjs/common';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';

// Returns null (see all) for owner; tenantId for everyone else.
export function getTenantId(user: AdminUser): number | null {
  if (user.role === AdminRole.OWNER) return null;
  if (!user.tenantId) throw new ForbiddenException('No tenant associated with this account');
  return user.tenantId;
}

export function isOwner(user: AdminUser): boolean {
  return user.role === AdminRole.OWNER;
}

// Keep backward compat alias
export function isSuperadmin(user: AdminUser): boolean {
  return user.role === AdminRole.OWNER || user.role === AdminRole.SUPERADMIN;
}
