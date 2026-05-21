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

// ── Owner Assistants ──────────────────────────────────────────
export const ownerAssistantsApi = {
  list: () => api.get('/owner-assistants'),
  permissions: () => api.get('/owner-assistants/permissions'),
  create: (data: unknown) => api.post('/owner-assistants', data),
  update: (id: number, data: unknown) => api.patch(`/owner-assistants/${id}`, data),
  remove: (id: number) => api.delete(`/owner-assistants/${id}`),
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
export const usersApi = {
  list: () => api.get('/radius-users'),
  get: (username: string) => api.get(`/radius-users/${username}`),
  stats: (username: string) => api.get(`/radius-users/${username}/stats`),
  create: (data: unknown) => api.post('/radius-users', data),
  update: (username: string, data: unknown) => api.patch(`/radius-users/${username}`, data),
  remove: (username: string) => api.delete(`/radius-users/${username}`),
  kick: (username: string) => api.post(`/radius-users/${username}/kick`),
}

// ── NAS ───────────────────────────────────────────────────────
export const nasApi = {
  list: () => api.get('/nas'),
  create: (data: unknown) => api.post('/nas', data),
  update: (id: number, data: unknown) => api.patch(`/nas/${id}`, data),
  remove: (id: number) => api.delete(`/nas/${id}`),
  check: (id: number) => api.get(`/nas/${id}/check`),
  downloadMikrotikScript: (id: number) =>
    api.get(`/nas/${id}/mikrotik-script`, { responseType: 'blob' }),
  fetchCommand: (id: number) => api.get(`/nas/${id}/fetch-command`),
}

// ── Groups ────────────────────────────────────────────────────
export const groupsApi = {
  list: () => api.get('/groups'),
  get: (name: string) => api.get(`/groups/${name}`),
  create: (data: unknown) => api.post('/groups', data),
  remove: (name: string) => api.delete(`/groups/${name}`),
}

// ── Plans ─────────────────────────────────────────────────────
export const plansApi = {
  list: () => api.get('/plans'),
  get: (id: number) => api.get(`/plans/${id}`),
  create: (data: unknown) => api.post('/plans', data),
  update: (id: number, data: unknown) => api.patch(`/plans/${id}`, data),
  remove: (id: number) => api.delete(`/plans/${id}`),
}

// ── Topup Packages ────────────────────────────────────────────
export const topupsApi = {
  listPackages: () => api.get('/topup-packages'),
  createPackage: (data: unknown) => api.post('/topup-packages', data),
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
  generate: (data: unknown) => api.post('/voucher-cards/generate', data),
  list: (params?: Record<string, unknown>) => api.get('/voucher-cards', { params }),
  batches: () => api.get('/voucher-cards/batches'),
  update: (id: number, data: unknown) => api.patch(`/voucher-cards/${id}`, data),
  disable: (id: number) => api.post(`/voucher-cards/${id}/disable`),
  remove: (id: number) => api.delete(`/voucher-cards/${id}`),
  removeBatch: (name: string) => api.delete(`/voucher-cards/batch/${encodeURIComponent(name)}`),
  batchCards: (name: string) => api.get(`/voucher-cards/batch/${encodeURIComponent(name)}/cards`),
  removeByRange: (from: string, to: string) => api.delete('/voucher-cards/range/delete', { params: { from, to } }),
  disableByRange: (from: string, to: string) => api.post('/voucher-cards/range/disable', null, { params: { from, to } }),
}


// ── Accounting ────────────────────────────────────────────────
export const accountingApi = {
  sessions: (active?: boolean) =>
    api.get('/accounting/sessions', { params: active !== undefined ? { active } : {} }),
  authLogs: () => api.get('/accounting/auth-logs'),
  authLogMonths: () => api.get('/accounting/auth-logs/months'),
  deleteAuthLogsByMonth: (month: string) => api.delete(`/accounting/auth-logs/months/${month}`),
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
