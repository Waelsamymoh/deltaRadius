import axios from 'axios'

// Extract subdomain from hostname: delta.delta-group.online → "delta"
// Returns null for main domain or localhost
function getSubdomain(): string | null {
  const host = window.location.hostname
  // IP address → no subdomain
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null
  const parts = host.split('.')
  // localhost or single-part host → no subdomain
  if (parts.length < 3) return null
  const sub = parts[0]
  // skip "www" and "owner"
  if (sub === 'www' || sub === 'owner') return null
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
    if (err.response?.status === 401) {
      const hasToken = !!localStorage.getItem('token')
      const isLoginPage = window.location.pathname === '/login'
      if (hasToken && !isLoginPage) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.replace('/login')
      }
    }
    return Promise.reject(err)
  }
)

export default api
