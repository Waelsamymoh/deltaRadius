import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { LogIn, Loader2, ArrowRight, Wifi } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().min(3, 'مطلوب'),
  password: z.string().min(1, 'مطلوب'),
})
type FormData = z.infer<typeof schema>

function getBaseDomain() {
  const parts = window.location.hostname.split('.')
  return parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
}
function getDashboardUrl(sub: string) {
  const port = window.location.port ? ':' + window.location.port : ''
  return `${window.location.protocol}//${sub}.${getBaseDomain()}${port}`
}

export default function LandingLoginPage() {
  // Clear any stale apex-domain session on mount. If the user reached /login
  // it means they want a fresh sign-in (typically after a logout, or because
  // the previous session expired). Removes the "stuck after logout" loop
  // where landing would redirect to a dashboard the user no longer has.
  useEffect(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('tenant_subdomain')
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const loginMutation = useMutation({
    mutationFn: (d: FormData) =>
      authApi.loginFromLanding(d.email, d.password).then(r => r.data),
    onSuccess: (data) => {
      // Remember the apex-side session so future visits to landing can
      // auto-redirect this user to their dashboard.
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('tenant_subdomain', data.subdomain)
      const payload = encodeURIComponent(JSON.stringify({
        token: data.access_token, user: data.user,
      }))
      window.location.href = `${getDashboardUrl(data.subdomain)}/dashboard#auto-login=${payload}`
    },
  })

  return (
    <div
      className="bg-[#111] min-h-screen text-white flex flex-col"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      {/* Tiny navbar */}
      <nav className="border-b border-white/5 bg-[#111]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-black text-xl">
            <Wifi className="h-5 w-5 text-primary" />
            <span>Delta<span className="text-primary">Group</span></span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
            الرئيسية
          </Link>
        </div>
      </nav>

      {/* Centered card */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* orange glow */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/15 border border-primary/30 mb-4">
              <LogIn className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-black">دخول العملاء</h1>
            <p className="text-white/50 text-sm mt-2">
              ادخل بياناتك وسيتم تحويلك مباشرة إلى لوحة تحكم شبكتك
            </p>
          </div>

          <div className="border border-white/10 bg-white/[0.03] rounded-2xl p-6 backdrop-blur">
            <form
              onSubmit={handleSubmit(d => loginMutation.mutate(d))}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <Label className="text-white/80 font-semibold">البريد الإلكتروني أو اسم المستخدم</Label>
                <Input
                  {...register('email')}
                  type="text"
                  dir="ltr"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11 text-left"
                  placeholder="admin أو admin@myisp.com"
                  autoFocus
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-white/80 font-semibold">كلمة المرور</Label>
                <Input
                  type="password"
                  {...register('password')}
                  dir="ltr"
                  placeholder="••••••••"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11"
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              {loginMutation.isError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2.5">
                  {(loginMutation.error as any)?.response?.data?.message ?? 'بيانات الدخول غير صحيحة'}
                </p>
              )}

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full h-11 gap-1.5 text-base font-bold"
              >
                {loginMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري التحقق...</>
                  : <><LogIn className="h-4 w-4" /> دخول</>}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-white/40 mt-6">
            ليس عندك حساب؟{' '}
            <Link to="/" className="text-primary font-semibold hover:underline">
              سجّل شبكتك الآن
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
