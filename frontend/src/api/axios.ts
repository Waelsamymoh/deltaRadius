import axios from 'axios'

// Extract subdomain from hostname: delta.delta-group.online → "delta"
// Returns null for main domain, localhost, IP, admin subdomain
export function getSubdomain(): string | null {
  const host = window.location.hostname
  // IP address → no subdomain
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null
  const parts = host.split('.')
  // localhost or single-part host → no subdomain
  if (parts.length < 3) return null
  const sub = parts[0]
  // skip "www" and "owner"
  if (sub === 'www' || sub === 'owner' || sub === 'admin') return null
  return sub
}

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const subdomain = getSubdomain()
  if (subdomain) config.headers['X-Tenant-Subdomain'] = subdomain
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.data?.code === 'TENANT_NOT_FOUND') {
      const parts = window.location.hostname.split('.')
      const mainHostname = parts.slice(-2).join('.')
      const port = window.location.port
      window.location.href = `${window.location.protocol}//${mainHostname}${port ? ':' + port : ''}/`
      return Promise.reject(err)
    }
    if (err.response?.status === 401) {
      const hasToken = !!localStorage.getItem('token')
      const isLoginPage = window.location.pathname === '/login'
      if (hasToken && !isLoginPage) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // Single login page lives on the apex domain.
        const parts = window.location.hostname.split('.')
        const baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
        const port = window.location.port ? `:${window.location.port}` : ''
        window.location.replace(`${window.location.protocol}//${baseDomain}${port}/login`)
      }
    }
    return Promise.reject(err)
  }
)

export default api
