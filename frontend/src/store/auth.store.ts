import { create } from 'zustand'
import api from '@/api/axios'

interface User {
  id: number
  email: string
  fullName: string | null
  role: 'owner' | 'owner_assistant' | 'superadmin' | 'admin' | 'moderator'
  tenantId: number | null
  permissions?: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hydrate: () => void
  updateSession: (user: User, token: string) => void
}

/** If the URL has an #auto-login=<json> fragment (set by the landing-page
 *  login/signup redirect), pull it into localStorage and wipe the hash —
 *  BEFORE the React tree mounts, so ProtectedRoute sees the session on the
 *  very first render instead of bouncing the user to /login. */
function consumeAutoLoginHash(): { token: string; user: User } | null {
  try {
    const m = window.location.hash.match(/auto-login=([^&]+)/)
    if (!m) return null
    const { token, user } = JSON.parse(decodeURIComponent(m[1]))
    if (!token || !user) return null
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return { token, user }
  } catch { return null }
}

function loadFromStorage(): { token: string | null; user: User | null } {
  // Consume any auto-login hash FIRST so a fresh apex-login redirect lands
  // straight on the dashboard.
  const fromHash = consumeAutoLoginHash()
  if (fromHash) return fromHash
  try {
    const token = localStorage.getItem('token')
    const raw = localStorage.getItem('user')
    if (token && raw) return { token, user: JSON.parse(raw) }
  } catch { /* ignore */ }
  return { token: null, user: null }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadFromStorage(),

  hydrate: () => {
    set(loadFromStorage())
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ token: data.access_token, user: data.user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
    // Send the user to the apex landing with a ?logout=1 marker so the apex
    // page can clear its own localStorage (cross-subdomain storage isolation
    // means subdomain logout can't touch the apex copy directly).
    const parts = window.location.hostname.split('.')
    const baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
    const port = window.location.port ? `:${window.location.port}` : ''
    window.location.href = `${window.location.protocol}//${baseDomain}${port}/?logout=1`
  },

  updateSession: (user: User, token: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token })
  },
}))
