import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserCog, KeyRound, CheckCircle2, Mail, ShieldCheck, Clock, Save } from 'lucide-react'
import { authApi, tenantSettingsApi, settingsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const infoSchema = z.object({
  email: z.string().min(3, 'على الأقل 3 أحرف').regex(/^[a-zA-Z0-9_.-]+$/, 'أحرف إنجليزية وأرقام فقط'),
  fullName: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'مطلوب'),
  newPassword: z.string().min(6, 'على الأقل 6 أحرف'),
  confirmPassword: z.string().min(1, 'مطلوب'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
})

type InfoForm = z.infer<typeof infoSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { user, updateSession } = useAuthStore()
  const qc = useQueryClient()
  const [infoSuccess, setInfoSuccess] = useState(false)
  const [passSuccess, setPassSuccess] = useState(false)
  const isTenantAdmin = user?.role === 'superadmin'
  const isOwner = user?.role === 'owner'

  // System time config (owner only) — auto (timezone) or manual (set clock)
  const [timeMode, setTimeMode] = useState<'auto' | 'manual'>('auto')
  const [tz, setTz] = useState('')
  const [manualDt, setManualDt] = useState('')
  const [tzSaved, setTzSaved] = useState(false)
  const timeQuery = useQuery({
    queryKey: ['system-time'],
    queryFn: () => settingsApi.getTime().then(r => r.data as { mode: 'auto' | 'manual'; timezone: string; now: string; today: string }),
    enabled: isOwner,
  })
  useEffect(() => {
    if (timeQuery.data) {
      setTimeMode(timeQuery.data.mode)
      setTz(timeQuery.data.timezone)
      // prefill the manual input with the current system clock (YYYY-MM-DDTHH:mm)
      if (timeQuery.data.now) setManualDt(String(timeQuery.data.now).slice(0, 16))
    }
  }, [timeQuery.data])
  const tzMutation = useMutation({
    mutationFn: () => timeMode === 'manual' ? settingsApi.setTimeManual(manualDt) : settingsApi.setTimeAuto(tz),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-time'] })
      setTzSaved(true)
      setTimeout(() => setTzSaved(false), 2000)
    },
  })

  const TIMEZONES = [
    'Africa/Cairo', 'Asia/Riyadh', 'Asia/Baghdad', 'Asia/Dubai', 'Asia/Kuwait',
    'Asia/Qatar', 'Asia/Amman', 'Asia/Beirut', 'Asia/Jerusalem', 'Africa/Khartoum',
    'Africa/Tripoli', 'Africa/Algiers', 'Africa/Casablanca', 'Asia/Aden', 'UTC',
  ]

  const infoForm = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    defaultValues: { email: user?.email ?? '', fullName: user?.fullName ?? '' },
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const infoMutation = useMutation({
    mutationFn: (data: InfoForm) => authApi.updateProfile(data),
    onSuccess: (res) => {
      updateSession(res.data.user, res.data.access_token)
      setInfoSuccess(true)
      setTimeout(() => setInfoSuccess(false), 3000)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      authApi.updateProfile({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: (res) => {
      updateSession(res.data.user, res.data.access_token)
      passwordForm.reset()
      setPassSuccess(true)
      setTimeout(() => setPassSuccess(false), 3000)
    },
  })

  // Tenant-wide settings (visible only to the tenant's superadmin).
  const [expiryTime, setExpiryTime] = useState('12:00')
  const [expirySaved, setExpirySaved] = useState(false)
  const { data: tenantSettings } = useQuery<{ defaultExpiryTime: string }>({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get().then(r => r.data),
    enabled: isTenantAdmin,
  })
  useEffect(() => {
    if (tenantSettings?.defaultExpiryTime) setExpiryTime(tenantSettings.defaultExpiryTime)
  }, [tenantSettings])
  const expirySaveMutation = useMutation({
    mutationFn: (payload: { defaultExpiryTime: string }) => tenantSettingsApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings'] })
      setExpirySaved(true)
      setTimeout(() => setExpirySaved(false), 2000)
    },
  })

  const roleLabels: Record<string, string> = {
    owner: 'مالك النظام',
    owner_assistant: 'مساعد المالك',
    superadmin: 'مدير',
    admin: 'مشرف',
    moderator: 'بائع',
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserCog className="h-7 w-7" /> الملف الشخصي
        </h1>
        <p className="text-muted-foreground mt-1">تعديل بيانات حسابك</p>
      </div>

      {/* Account summary header */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-black text-2xl shrink-0">
              {(user?.fullName || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground truncate">
                  {user?.fullName || user?.email}
                </h2>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                  <ShieldCheck className="h-3 w-3" />
                  {roleLabels[user?.role ?? ''] ?? user?.role}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <Mail className="h-3.5 w-3.5" />
                <span className="font-mono">{user?.email}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System timezone — owner only */}
      {isOwner && (
        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> توقيت النظام العام
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              التوقيت الذي يعمل به النظام بالكامل — يُحتسب الاستهلاك اليومي للرواتر وتدوّر اليوم الجديد حسبه (وليس حسب توقيت المايكروتك أو الخادم).
            </p>

            {/* Current system clock */}
            {timeQuery.data?.now && (
              <div className="mb-3 text-sm bg-primary/5 border border-primary/15 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                وقت النظام الحالي: <strong className="font-mono" dir="ltr">{String(timeQuery.data.now).replace('T', ' ').slice(0, 16)}</strong>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setTimeMode('auto')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${timeMode === 'auto' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-input hover:text-foreground'}`}
              >تلقائي (منطقة زمنية)</button>
              <button
                onClick={() => setTimeMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${timeMode === 'manual' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-input hover:text-foreground'}`}
              >ضبط يدوي</button>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              {timeMode === 'auto' ? (
                <div className="space-y-1">
                  <Label>المنطقة الزمنية</Label>
                  <select
                    value={tz}
                    onChange={e => setTz(e.target.value)}
                    className="border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm min-w-[200px]"
                  >
                    {tz && !TIMEZONES.includes(tz) && <option value={tz}>{tz}</option>}
                    {TIMEZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>التاريخ والوقت الحالي</Label>
                  <Input type="datetime-local" value={manualDt} onChange={e => setManualDt(e.target.value)} className="min-w-[220px]" />
                </div>
              )}
              <Button onClick={() => tzMutation.mutate()} disabled={tzMutation.isPending || (timeMode === 'auto' ? !tz : !manualDt)} className="gap-1.5">
                {tzSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {tzSaved ? 'تم الحفظ' : tzMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
            {timeMode === 'manual' && (
              <p className="text-xs text-muted-foreground mt-2">
                يضبط ساعة النظام على القيمة المُدخلة وتستمر بالعمل من تلك اللحظة. استخدمه إذا كان توقيت الخادم غير مضبوط.
              </p>
            )}
            {tzMutation.isError && (
              <p className="text-sm text-destructive mt-2">{(tzMutation.error as any)?.response?.data?.message ?? 'تعذّر الحفظ'}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Two-column grid: info + password */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Info card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4" /> البيانات الأساسية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={infoForm.handleSubmit(d => infoMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم الدخول</Label>
              <Input {...infoForm.register('email')} dir="ltr" className="text-left" placeholder="admin1" />
              <p className="text-xs text-muted-foreground">أحرف إنجليزية وأرقام فقط (a-z, 0-9, _ . -)</p>
              {infoForm.formState.errors.email && (
                <p className="text-xs text-destructive">{infoForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input {...infoForm.register('fullName')} placeholder="اسمك الكامل" />
            </div>
            {infoMutation.isError && (
              <p className="text-xs text-destructive">
                {(infoMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={infoMutation.isPending}>
                {infoMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              {infoSuccess && (
                <span className="flex items-center gap-1 text-emerald-500 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> تم الحفظ
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(d => passwordMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>كلمة المرور الحالية</Label>
              <Input type="password" {...passwordForm.register('currentPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" {...passwordForm.register('newPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>تأكيد كلمة المرور الجديدة</Label>
              <Input type="password" {...passwordForm.register('confirmPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            {passwordMutation.isError && (
              <p className="text-xs text-destructive">
                {(passwordMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
              </Button>
              {passSuccess && (
                <span className="flex items-center gap-1 text-emerald-500 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> تم التغيير
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      </div>

      {/* Tenant-wide settings — superadmin only */}
      {isTenantAdmin && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> إعدادات حساب العميل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">وقت انتهاء الاشتراك الافتراضي</Label>
              <p className="text-xs text-muted-foreground">
                عند تجديد أي مشترك بمدة معينة (مثلاً 30 يوم)، اشتراكه يفضل ساري
                حتى الوقت ده بالظبط في آخر يوم. الوقت بصيغة 24 ساعة.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="time"
                  value={expiryTime}
                  onChange={e => setExpiryTime(e.target.value)}
                  className="w-40 text-center text-lg font-mono"
                  dir="ltr"
                />
                <Button
                  onClick={() => expirySaveMutation.mutate({ defaultExpiryTime: expiryTime })}
                  disabled={expirySaveMutation.isPending || expiryTime === tenantSettings?.defaultExpiryTime}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  {expirySaveMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                {expirySaved && (
                  <span className="flex items-center gap-1 text-emerald-500 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> تم الحفظ
                  </span>
                )}
              </div>
              {expirySaveMutation.isError && (
                <p className="text-xs text-destructive">
                  {(expirySaveMutation.error as any)?.response?.data?.message ?? 'تعذّر الحفظ'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
