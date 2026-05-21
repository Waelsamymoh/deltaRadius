import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Mark a route as requiring one of the given owner-assistant permissions.
 *  Owner always passes; assistants must have at least one of the listed keys. */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

/** Canonical list of permission keys assignable to owner assistants. */
export const OWNER_PERMISSION_KEYS = [
  'tenants.manage',
  'nas.manage',
  'users.manage',
  'plans.manage',
  'topups.manage',
  'cards.manage',
  'accounting.view',
  'sstp.manage',
] as const;
export type OwnerPermissionKey = typeof OWNER_PERMISSION_KEYS[number];
