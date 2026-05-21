import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'

/** Single source of truth for login is the apex /login page. If we end up on
 *  a subdomain without a session, bounce the user to the apex login form. */
function apexLoginUrl(): string {
  const parts = window.location.hostname.split('.')
  const baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
  const port = window.location.port ? `:${window.location.port}` : ''
  return `${window.location.protocol}//${baseDomain}${port}/login`
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  useEffect(() => {
    if (!token) window.location.href = apexLoginUrl()
  }, [token])
  if (!token) return null
  return <>{children}</>
}
