import api from './axios'

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  profile: () => api.get('/auth/profile'),
  updateProfile: (data: unknown) => api.patch('/auth/profile', data),
  register: (data: unknown) => api.post('/auth/register', data),
  setupStatus: () => api.get('/auth/setup-status'),
  setupFirstAdmin: (data: unknown) => api.post('/auth/setup', data),
}

// ── Tenants ───────────────────────────────────────────────────
export const tenantsApi = {
  list: () => api.get('/tenants'),
  create: (data: unknown) => api.post('/tenants', data),
  update: (id: number, data: unknown) => api.patch(`/tenants/${id}`, data),
  resetAdminPassword: (id: number, password: string) => api.patch(`/tenants/${id}/admin-password`, { password }),
  remove: (id: number) => api.delete(`/tenants/${id}`),
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

// ── Admin Users ───────────────────────────────────────────────
export const adminUsersApi = {
  list: () => api.get('/admin-users'),
  archived: () => api.get('/admin-users/archived'),
  create: (data: unknown) => api.post('/admin-users', data),
  update: (id: number, data: unknown) => api.patch(`/admin-users/${id}`, data),
  archive: (id: number) => api.post(`/admin-users/${id}/archive`),
  restore: (id: number) => api.post(`/admin-users/${id}/restore`),
  permanentDelete: (id: number) => api.delete(`/admin-users/${id}/permanent`),
  getPermissions: (id: number) => api.get(`/admin-users/${id}/permissions`),
  setPermissions: (id: number, permissions: string[]) =>
    api.patch(`/admin-users/${id}/permissions`, { permissions }),
}

// ── Accounting ────────────────────────────────────────────────
export const accountingApi = {
  sessions: (active?: boolean) =>
    api.get('/accounting/sessions', { params: active !== undefined ? { active } : {} }),
  authLogs: () => api.get('/accounting/auth-logs'),
  stats: () => api.get('/accounting/stats'),
  dashboard: () => api.get('/accounting/dashboard'),
}
