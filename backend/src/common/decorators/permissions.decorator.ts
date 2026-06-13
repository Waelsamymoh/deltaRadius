import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Mark a route as requiring one of the given owner-assistant permissions.
 *  Owner always passes; assistants must have at least one of the listed keys. */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

/** Canonical list of permission keys assignable to owner assistants. */
export const OWNER_PERMISSION_KEYS = [
  'tenants.manage',
  'nas.manage',
  'modems.manage',
  'users.manage',
  'plans.manage',
  'topups.manage',
  'cards.manage',
  'accounting.view',
  'sstp.manage',
] as const;
export type OwnerPermissionKey = typeof OWNER_PERMISSION_KEYS[number];

/** Canonical list of permission keys assignable to TENANT assistants.
 *  Subset of owner keys — tenant assistants never touch cross-tenant resources
 *  (no `tenants.manage`, no `sstp.manage`).
 *
 *  Special key `users.hide_list` is a RESTRICTION (not a grant): when present
 *  alongside `users.manage`, the subscriber list is hidden by default and
 *  becomes accessible only via search. */
export const TENANT_PERMISSION_KEYS = [
  'nas.manage',
  'modems.manage',
  // ─── Subscribers page (granular) ───
  'users.manage',         // view the subscribers page (المشتركين)
  'users.sales',          // view the sales page (المبيعات) — same data, different sidebar entry
  'users.create',         // add new subscribers
  'users.edit',           // edit subscriber info
  'users.renew',          // renew subscription (extend dates)
  'users.delete',         // archive / restore / permanent delete
  'users.suspend',        // suspend / resume / kick
  'users.topup',          // apply / clear topup packages
  'users.view_detail',    // open the subscriber dashboard
  'users.hide_list',      // restriction: hide list, reveal via search only
  // ─── Other resources ───
  'plans.view',           // read plans only (for sales renewal dropdown — no sidebar link)
  'plans.manage',         // full plans management page
  'topups.manage',
  'cards.manage',
  'accounting.view',
] as const;
export type TenantPermissionKey = typeof TENANT_PERMISSION_KEYS[number];
