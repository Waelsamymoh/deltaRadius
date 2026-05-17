import { create } from 'zustand'
import api from '@/api/axios'

interface User {
  id: number
  email: string
  fullName: string | null
  role: 'owner' | 'superadmin' | 'admin' | 'moderator'
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

function loadFromStorage(): { token: string | null; user: User | null } {
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
    window.location.href = '/login'
  },

  updateSession: (user: User, token: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token })
  },
}))
