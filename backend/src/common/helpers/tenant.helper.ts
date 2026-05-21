import { ForbiddenException } from '@nestjs/common';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';

// Returns null (see all) for owner & owner-assistants; tenantId for everyone else.
export function getTenantId(user: AdminUser): number | null {
  if (user.role === AdminRole.OWNER || user.role === AdminRole.OWNER_ASSISTANT) return null;
  if (!user.tenantId) throw new ForbiddenException('No tenant associated with this account');
  return user.tenantId;
}

export function isOwner(user: AdminUser): boolean {
  return user.role === AdminRole.OWNER;
}

/** True for the owner or anyone who acts on the owner's behalf. */
export function isOwnerSide(user: AdminUser): boolean {
  return user.role === AdminRole.OWNER || user.role === AdminRole.OWNER_ASSISTANT;
}

/** Owner has all permissions implicitly; assistants are gated by their `permissions` array. */
export function hasPermission(user: AdminUser, key: string): boolean {
  if (user.role === AdminRole.OWNER) return true;
  if (user.role === AdminRole.OWNER_ASSISTANT) return (user.permissions ?? []).includes(key);
  return false;
}

// Keep backward compat alias
export function isSuperadmin(user: AdminUser): boolean {
  return user.role === AdminRole.OWNER || user.role === AdminRole.SUPERADMIN;
}
