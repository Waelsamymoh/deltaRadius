import api from './axios'

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  profile: () => api.get('/auth/profile'),
  updateProfile: (data: unknown) => api.patch('/auth/profile', data),
  register: (data: unknown) => api.post('/auth/register', data),
  setupStatus: () => api.get('/auth/setup-status'),
  setupFirstAdmin: (data: unknown) => api.post('/auth/setup', data),
  selfRegister: (data: unknown) => api.post('/auth/self-register', data),
  loginFromLanding: (email: string, password: string) =>
    api.post('/auth/login-from-landing', { email, password }),
}

// ── Server Health (owner-side) ────────────────────────────────
export const serverHealthApi = {
  get: () => api.get('/server-health'),
}

// ── System Settings (timezone — owner sets, anyone reads) ─────
export const settingsApi = {
  getTimezone: () => api.get('/settings/timezone'),
  setTimezone: (timezone: string) => api.put('/settings/timezone', { timezone }),
  /** Full time config + current system clock. */
  getTime: () => api.get('/settings/time'),
  setTimeAuto: (timezone: string) => api.put('/settings/time', { mode: 'auto', timezone }),
  setTimeManual: (datetime: string) => api.put('/settings/time', { mode: 'manual', datetime }),
}

// ── Backup & Restore (owner ONLY — whole database) ────────────
export const backupApi = {
  /** Download a full JSON snapshot of the database. */
  export: () => api.get('/backup/export', { responseType: 'blob' }),
  /** Upload a snapshot and FULL-REPLACE the database. Destructive. */
  import: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/backup/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  /** Per-tenant: download this tenant's data only. */
  tenantExport: (tenantId?: number | null) =>
    api.get('/tenant-backup/export', { responseType: 'blob', params: tenantId ? { tenantId } : {} }),
  /** Per-tenant: restore this tenant's data only (replaces only this tenant). */
  tenantImport: (file: File, tenantId?: number | null) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/tenant-backup/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: tenantId ? { tenantId } : {},
    })
  },
}

// ── Owner Assistants ──────────────────────────────────────────
export const ownerAssistantsApi = {
  list: () => api.get('/owner-assistants'),
  permissions: () => api.get('/owner-assistants/permissions'),
  create: (data: unknown) => api.post('/owner-assistants', data),
  update: (id: number, data: unknown) => api.patch(`/owner-assistants/${id}`, data),
  remove: (id: number) => api.delete(`/owner-assistants/${id}`),
}

// ── Tenant Assistants (per-tenant supervisors) ─────────────────
// Tenant admins (superadmin) manage their own assistants — no tenantId needed.
// Owner can manage any tenant's assistants by passing tenantId.
const tparam2 = (tenantId?: number | null) => (tenantId ? { tenantId } : {})
export const tenantAssistantsApi = {
  list: (tenantId?: number | null) =>
    api.get('/tenant-assistants', { params: tparam2(tenantId) }),
  permissions: () => api.get('/tenant-assistants/permissions'),
  create: (data: unknown, tenantId?: number | null) =>
    api.post('/tenant-assistants', data, { params: tparam2(tenantId) }),
  update: (id: number, data: unknown, tenantId?: number | null) =>
    api.patch(`/tenant-assistants/${id}`, data, { params: tparam2(tenantId) }),
  remove: (id: number, tenantId?: number | null) =>
    api.delete(`/tenant-assistants/${id}`, { params: tparam2(tenantId) }),
}

// ── Tenant Settings (current tenant) ──────────────────────────
export const tenantSettingsApi = {
  get: () => api.get('/tenants/settings'),
  update: (data: { defaultExpiryTime?: string }) => api.patch('/tenants/settings', data),
}

// ── Tenants ───────────────────────────────────────────────────
export const tenantsApi = {
  list: (includeArchived = false) =>
    api.get('/tenants', { params: includeArchived ? { includeArchived: 'true' } : {} }),
  get: (id: number) => api.get(`/tenants/${id}`),
  summary: (id: number) => api.get(`/tenants/${id}/summary`),
  create: (data: unknown) => api.post('/tenants', data),
  update: (id: number, data: unknown) => api.patch(`/tenants/${id}`, data),
  resetAdminPassword: (id: number, password: string) => api.patch(`/tenants/${id}/admin-password`, { password }),
  regenerateSstp: (id: number) => api.post(`/tenants/${id}/regenerate-sstp`),
  /** Soft-delete = archive (kicks active SSTP sessions, keeps the data). */
  archive: (id: number) => api.delete(`/tenants/${id}`),
  restore: (id: number) => api.post(`/tenants/${id}/restore`),
  /** Permanent delete — only after archive. Irreversible. */
  removePermanent: (id: number) => api.delete(`/tenants/${id}/permanent`),
  downloadMikrotikScript: (id: number) =>
    api.get(`/tenants/${id}/mikrotik-script`, { responseType: 'blob' }),
}

// ── RADIUS Users ──────────────────────────────────────────────
// Every per-user route accepts an optional `tenantId` so the owner can scope
// actions to a specific tenant. Without this, a username collision across
// tenants would match the wrong row / session.
const tparam = (tenantId?: number | null) => (tenantId ? { tenantId } : {})

export const usersApi = {
  list: (tenantId?: number | null, status?: 'online' | 'active' | 'suspended' | 'archived' | 'all', search?: string) =>
    api.get('/radius-users', {
      params: {
        ...tparam(tenantId),
        ...(status ? { status } : {}),
        ...(search?.trim() ? { search: search.trim() } : {}),
      },
    }),
  get: (username: string, tenantId?: number | null) =>
    api.get(`/radius-users/${username}`, { params: tparam(tenantId) }),
  stats: (username: string, tenantId?: number | null) =>
    api.get(`/radius-users/${username}/stats`, { params: tparam(tenantId) }),
  create: (data: unknown, tenantId?: number | null) =>
    api.post('/radius-users', data, { params: tparam(tenantId) }),
  update: (username: string, data: unknown, tenantId?: number | null) =>
    api.patch(`/radius-users/${username}`, data, { params: tparam(tenantId) }),
  renew: (username: string, startDate: string, durationDays: number, tenantId?: number | null, planId?: number) =>
    api.post(`/radius-users/${username}/renew`,
      { startDate, durationDays, ...(planId != null ? { planId } : {}) },
      { params: tparam(tenantId) }),
  /** Soft-delete = archive. Kicks user offline + blocks RADIUS auth. */
  remove: (username: string, tenantId?: number | null) =>
    api.delete(`/radius-users/${username}`, { params: tparam(tenantId) }),
  restore: (username: string, tenantId?: number | null) =>
    api.post(`/radius-users/${username}/restore`, undefined, { params: tparam(tenantId) }),
  suspend: (username: string, tenantId?: number | null) =>
    api.post(`/radius-users/${username}/suspend`, undefined, { params: tparam(tenantId) }),
  resume: (username: string, tenantId?: number | null) =>
    api.post(`/radius-users/${username}/resume`, undefined, { params: tparam(tenantId) }),
  removePermanent: (username: string, tenantId?: number | null) =>
    api.delete(`/radius-users/${username}/permanent`, { params: tparam(tenantId) }),
  kick: (username: string, tenantId?: number | null) =>
    api.post(`/radius-users/${username}/kick`, undefined, { params: tparam(tenantId) }),
  /** Clears session history without affecting consumption counter. */
  clearSessions: (username: string, tenantId?: number | null) =>
    api.delete(`/radius-users/${username}/sessions`, { params: tparam(tenantId) }),
  /** Adds (or subtracts, if negative) GB to the consumption counter. */
  adjustUsage: (username: string, addGb: number, tenantId?: number | null) =>
    api.post(`/radius-users/${username}/adjust-usage`, { addGb }, { params: tparam(tenantId) }),
}

// ── Subscriber Self-Service Portal ────────────────────────────
// The portal uses its OWN token (separate localStorage key) so it never
// collides with an admin session on the same subdomain.
export const subscriberPortalApi = {
  login: (mobile: string, password: string) =>
    api.post('/subscriber-portal/login', { mobile, password }),
  me: () =>
    api.get('/subscriber-portal/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem('subscriber_token') ?? ''}` },
    }),
}

// ── NAS ───────────────────────────────────────────────────────
export const nasApi = {
  list: (tenantId?: number | null) =>
    api.get('/nas', { params: tenantId ? { tenantId } : {} }),
  create: (data: unknown, tenantId?: number | null) =>
    api.post('/nas', data, { params: tenantId ? { tenantId } : {} }),
  update: (id: number, data: unknown) => api.patch(`/nas/${id}`, data),
  remove: (id: number) => api.delete(`/nas/${id}`),
  check: (id: number) => api.get(`/nas/${id}/check`),
  downloadMikrotikScript: (id: number, ros?: number) =>
    api.get(`/nas/${id}/mikrotik-script`, { responseType: 'blob', params: ros ? { ros } : {} }),
  fetchCommand: (id: number, ros?: number) =>
    api.get(`/nas/${id}/fetch-command`, { params: ros ? { ros } : {} }),
}

// ── Modems (subscriber modems inventory — tenant side) ────────
export const modemsApi = {
  list: (tenantId?: number | null) =>
    api.get('/modems', { params: tenantId ? { tenantId } : {} }),
  /** Live stats (status + GB pulled from MikroTik). Polled by the UI. */
  live: (tenantId?: number | null) =>
    api.get('/modems/live', { params: tenantId ? { tenantId } : {} }),
  /** Consumption reports (mirror of the subscriber reports). */
  reportYearly: (years = 5, tenantId?: number | null, nasId?: number | null) =>
    api.get('/modems/reports/yearly', { params: { years, ...(tenantId ? { tenantId } : {}), ...(nasId ? { nasId } : {}) } }),
  reportMonthly: (year: number, tenantId?: number | null, nasId?: number | null) =>
    api.get('/modems/reports/monthly', { params: { year, ...(tenantId ? { tenantId } : {}), ...(nasId ? { nasId } : {}) } }),
  reportDaily: (year: number, month: number, tenantId?: number | null, nasId?: number | null) =>
    api.get('/modems/reports/daily', { params: { year, month, ...(tenantId ? { tenantId } : {}), ...(nasId ? { nasId } : {}) } }),
  reportDailyRouters: (year: number, month: number, day: number, tenantId?: number | null, nasId?: number | null) =>
    api.get('/modems/reports/daily/routers', { params: { year, month, day, ...(tenantId ? { tenantId } : {}), ...(nasId ? { nasId } : {}) } }),
  create: (data: unknown, tenantId?: number | null) =>
    api.post('/modems', data, { params: tenantId ? { tenantId } : {} }),
  update: (id: number, data: unknown) => api.patch(`/modems/${id}`, data),
  remove: (id: number) => api.delete(`/modems/${id}`),
  /** Fetch /ip/address list from a MikroTik (RouterOS 7 REST API). No DB write. */
  mikrotikFetch: (ip: string, username: string, password: string) =>
    api.post('/modems/mikrotik/fetch', { ip, username, password }),
  /** Bulk-create modem records from selected MikroTik address entries. */
  mikrotikImport: (ip: string, username: string, password: string, entries: unknown[], tenantId?: number | null, nasId?: number) =>
    api.post('/modems/mikrotik/import', { ip, username, password, entries, nasId },
      { params: tenantId ? { tenantId } : {} }),
  /** Sync modem statuses with current MikroTik interface running states. */
  mikrotikSync: (ip: string, username: string, password: string, tenantId?: number | null) =>
    api.post('/modems/mikrotik/sync', { ip, username, password },
      { params: tenantId ? { tenantId } : {} }),
  /** Reset traffic counters (consumption) for the given modems on the MikroTik. */
  resetCounters: (modemIds: number[], tenantId?: number | null) =>
    api.post('/modems/reset-counters', { modemIds },
      { params: tenantId ? { tenantId } : {} }),
  /** Enable/disable a modem's interface on the MikroTik. */
  setEnabled: (id: number, enabled: boolean, tenantId?: number | null) =>
    api.post(`/modems/${id}/set-enabled`, { enabled }, { params: tenantId ? { tenantId } : {} }),
  /** Daily auto-reset toggle (per tenant). */
  getAutoReset: (tenantId?: number | null) =>
    api.get('/modems/auto-reset', { params: tenantId ? { tenantId } : {} }),
  setAutoReset: (enabled: boolean, tenantId?: number | null) =>
    api.put('/modems/auto-reset', { enabled }, { params: tenantId ? { tenantId } : {} }),
}

// ── Plans ─────────────────────────────────────────────────────
export const plansApi = {
  list: (tenantId?: number | null) =>
    api.get('/plans', { params: tenantId ? { tenantId } : {} }),
  get: (id: number) => api.get(`/plans/${id}`),
  create: (data: unknown, tenantId?: number | null) =>
    api.post('/plans', data, { params: tenantId ? { tenantId } : {} }),
  update: (id: number, data: unknown) => api.patch(`/plans/${id}`, data),
  remove: (id: number) => api.delete(`/plans/${id}`),
}

// ── Topup Packages ────────────────────────────────────────────
export const topupsApi = {
  listPackages: (tenantId?: number | null) =>
    api.get('/topup-packages', { params: tenantId ? { tenantId } : {} }),
  createPackage: (data: unknown, tenantId?: number | null) =>
    api.post('/topup-packages', data, { params: tenantId ? { tenantId } : {} }),
  updatePackage: (id: number, data: unknown) => api.patch(`/topup-packages/${id}`, data),
  removePackage: (id: number) => api.delete(`/topup-packages/${id}`),
  applyToUser: (username: string, packageId: number) =>
    api.post(`/radius-users/${username}/topup`, { packageId }),
  userTopups: (username: string) => api.get(`/radius-users/${username}/topups`),
  clearBonus: (username: string) => api.delete(`/radius-users/${username}/bonus`),
  clearOneTopup: (username: string, topupId: number) => api.delete(`/radius-users/${username}/topups/${topupId}`),
}

// ── Voucher Cards ─────────────────────────────────────────────
export const voucherCardsApi = {
  generate: (data: unknown, tenantId?: number | null) =>
    api.post('/voucher-cards/generate', data, { params: tenantId ? { tenantId } : {} }),
  list: (params?: Record<string, unknown>) => api.get('/voucher-cards', { params }),
  batches: (tenantId?: number | null) =>
    api.get('/voucher-cards/batches', { params: tenantId ? { tenantId } : {} }),
  update: (id: number, data: unknown) => api.patch(`/voucher-cards/${id}`, data),
  disable: (id: number) => api.post(`/voucher-cards/${id}/disable`),
  remove: (id: number) => api.delete(`/voucher-cards/${id}`),
  removeBatch: (name: string, tenantId?: number | null) =>
    api.delete(`/voucher-cards/batch/${encodeURIComponent(name)}`, { params: tenantId ? { tenantId } : {} }),
  batchCards: (name: string, tenantId?: number | null) =>
    api.get(`/voucher-cards/batch/${encodeURIComponent(name)}/cards`, { params: tenantId ? { tenantId } : {} }),
  removeByRange: (from: string, to: string, tenantId?: number | null) =>
    api.delete('/voucher-cards/range/delete', { params: { from, to, ...(tenantId ? { tenantId } : {}) } }),
  disableByRange: (from: string, to: string, tenantId?: number | null) =>
    api.post('/voucher-cards/range/disable', null, { params: { from, to, ...(tenantId ? { tenantId } : {}) } }),
}


// ── Audit Logs (every action by admins/supervisors) ───────────
export const auditLogsApi = {
  list:    (params?: { adminId?: number; from?: string; to?: string; action?: string; limit?: number }) =>
    api.get('/audit-logs', { params }),
  summary: (params?: { from?: string; to?: string }) =>
    api.get('/audit-logs/summary', { params }),
  months:  () => api.get('/audit-logs/months'),
  deleteByMonth: (month: string) => api.delete(`/audit-logs/months/${month}`),
}

// ── Sales Receipts (per-supervisor renewal history) ──────────
export const salesReceiptsApi = {
  list:    (params?: { adminId?: number; from?: string; to?: string }) =>
    api.get('/sales-receipts', { params }),
  summary: (params?: { from?: string; to?: string }) =>
    api.get('/sales-receipts/summary', { params }),
  remove:  (id: number) => api.delete(`/sales-receipts/${id}`),
}

// ── Reports (per-tenant usage breakdown) ──────────────────────
export const reportsApi = {
  yearly:  (years = 5, tenantId?: number | null) =>
    api.get('/reports/yearly',  { params: { years,                ...(tenantId ? { tenantId } : {}) } }),
  monthly: (year: number, tenantId?: number | null) =>
    api.get('/reports/monthly', { params: { year,                 ...(tenantId ? { tenantId } : {}) } }),
  daily:   (year: number, month: number, tenantId?: number | null) =>
    api.get('/reports/daily',   { params: { year, month,          ...(tenantId ? { tenantId } : {}) } }),
  dailySubscribers: (year: number, month: number, day: number, tenantId?: number | null) =>
    api.get('/reports/daily/subscribers', { params: { year, month, day, ...(tenantId ? { tenantId } : {}) } }),
}

// ── Accounting ────────────────────────────────────────────────
export const accountingApi = {
  sessions: (active?: boolean) =>
    api.get('/accounting/sessions', { params: active !== undefined ? { active } : {} }),
  authLogs: () => api.get('/accounting/auth-logs'),
  authLogMonths: () => api.get('/accounting/auth-logs/months'),
  deleteAuthLogsByMonth: (month: string) => api.delete(`/accounting/auth-logs/months/${month}`),
  deleteAllAuthLogs: () => api.delete('/accounting/auth-logs'),
  getAuthLogAutoPurge: () => api.get('/accounting/auth-logs/auto-purge'),
  setAuthLogAutoPurge: (data: { enabled: boolean; days?: number | null; unit?: 'days' | 'hours' }) =>
    api.put('/accounting/auth-logs/auto-purge', data),
  stats: () => api.get('/accounting/stats'),
  dashboard: () => api.get('/accounting/dashboard'),
  cleanupStaleSessions: () => api.post('/accounting/sessions/cleanup-stale'),
}

// ── SSTP VPN ──────────────────────────────────────────────────
export const sstpApi = {
  // user management
  listUsers: () => api.get('/sstp/users'),
  createUser: (data: { username: string; password: string; ip?: string }) => api.post('/sstp/users', data),
  updateUser: (username: string, password: string) => api.patch(`/sstp/users/${username}`, { password }),
  deleteUser: (username: string) => api.delete(`/sstp/users/${username}`),
  // runtime
  status: () => api.get('/sstp/status'),
  stat: () => api.get('/sstp/stat'),
  sessions: () => api.get('/sstp/sessions'),
  terminate: (username: string) => api.post(`/sstp/terminate/${username}`),
  // config
  config: () => api.get('/sstp/config'),
  updateConfig: (data: { gwIp?: string; ipPool?: string; dns1?: string; dns2?: string }) =>
    api.post('/sstp/config', data),
  restart: () => api.post('/sstp/restart'),
}
