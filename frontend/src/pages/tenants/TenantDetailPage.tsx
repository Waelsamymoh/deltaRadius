import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  ArrowRight, Building2, Download, RefreshCw, KeyRound, ShieldCheck,
  Trash2, Save, Lock, Users, Network, ListChecks, Activity, ExternalLink,
  CreditCard, Database, DatabaseBackup,
} from 'lucide-react'
import { tenantsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

type Tenant = {
  id: number
  name: string
  subdomain: string | null
  businessName: string | null
  realm: string | null
  description: string | null
  isActive: boolean
  createdAt: string
  sstpUsername: string | null
  sstpPassword: string | null
  sstpIp: string | null
}

type Summary = {
  tenant: Tenant
  counts: {
    users: number
    nas: number
    plans: number
    cards: number
    topups: number
    activeSessions: number
    totalSessions: number
  }
}

type EditForm = {
  name: string
  subdomain: string
  businessName: string
  description: string
  isActive: boolean
  sstpIp: string
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function StatCard({
  icon: Icon, label, value, accent, to,
}: {
  icon: any; label: string; value: number | string; accent?: string; to?: string
}) {
  const navigate = useNavigate()
  const clickable = !!to
  return (
    <Card
      className={clickable ? 'cursor-pointer transition-colors hover:bg-muted/40' : ''}
      onClick={clickable ? () => navigate(to!) : undefined}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-md p-2 ${accent ?? 'bg-muted'}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
          {clickable && <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>
      </CardContent>
    </Card>
  )
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const tenantId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isOwner = currentUser?.role === 'owner'

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminPwd, setShowAdminPwd] = useState(false)

  const { data: summary, isLoading } = useQuery<Summary>({
    queryKey: ['tenant', tenantId, 'summary'],
    queryFn: () => tenantsApi.summary(tenantId).then(r => r.data),
    enabled: Number.isFinite(tenantId),
  })

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<EditForm>({
    values: summary
      ? {
          name: summary.tenant.name,
          subdomain: summary.tenant.subdomain ?? '',
          businessName: summary.tenant.businessName ?? '',
          description: summary.tenant.description ?? '',
          isActive: summary.tenant.isActive,
          sstpIp: summary.tenant.sstpIp ?? '',
        }
      : undefined,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<EditForm>) => tenantsApi.update(tenantId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
  })

  const regenMutation = useMutation({
    mutationFn: () => tenantsApi.regenerateSstp(tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
  })

  const resetPwdMutation = useMutation({
    mutationFn: (password: string) => tenantsApi.resetAdminPassword(tenantId, password),
    onSuccess: () => { setAdminPassword(''); setShowAdminPwd(false) },
  })

  const clearIpMutation = useMutation({
    mutationFn: () => tenantsApi.update(tenantId, { sstpIp: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => tenantsApi.archive(tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); navigate('/tenants') },
  })

  const downloadScript = async () => {
    const res = await tenantsApi.downloadMikrotikScript(tenantId)
    const slug = summary?.tenant.subdomain || summary?.tenant.name || 'tenant'
    downloadBlob(res.data, `mikrotik-${slug}.rsc`)
  }

  const onSubmit = (data: EditForm) => {
    const payload: any = {
      name: data.name,
      subdomain: data.subdomain || undefined,
      businessName: data.businessName || undefined,
      description: data.description || undefined,
      isActive: data.isActive,
    }
    if (isOwner) {
      const ip = data.sstpIp.trim()
      if (ip && ip !== (summary?.tenant.sstpIp ?? '')) payload.sstpIp = ip
    }
    updateMutation.mutate(payload)
  }

  if (isLoading || !summary) {
    return <div className="p-8 text-muted-foreground">جاري التحميل...</div>
  }

  const t = summary.tenant

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tenants')} className="gap-1">
            <ArrowRight className="h-4 w-4" /> العودة للقائمة
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" /> {t.name}
              <Badge variant={t.isActive ? 'default' : 'secondary'} className="ml-2">
                {t.isActive ? 'نشط' : 'موقوف'}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {t.subdomain ? `${t.subdomain}.delta-group.online · ` : ''}
              لوحة التحكم الكاملة للعميل
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => navigate(`/tenant-backup?tenant=${tenantId}`)}
            className="gap-1.5"
          >
            <DatabaseBackup className="h-4 w-4" /> نسخة احتياطية
          </Button>
          {isOwner && (
            <Button
              variant="outline" size="sm"
              onClick={() => setDeleteOpen(true)}
              className="gap-1.5 text-amber-500 border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
            >
              <Trash2 className="h-4 w-4" /> أرشفة العميل
            </Button>
          )}
        </div>
      </div>

      {/* Stats — clickable cards scope each resource page to this tenant */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={Users} label="المشتركين" value={summary.counts.users}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          to={`/users?tenant=${tenantId}`}
        />
        <StatCard
          icon={Network} label="أجهزة NAS" value={summary.counts.nas}
          accent="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
          to={`/nas?tenant=${tenantId}`}
        />
        <StatCard
          icon={ListChecks} label="الباقات" value={summary.counts.plans}
          accent="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
          to={`/plans?tenant=${tenantId}`}
        />
        <StatCard
          icon={CreditCard} label="الكروت" value={summary.counts.cards}
          accent="bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300"
          to={`/cards?tenant=${tenantId}`}
        />
        <StatCard
          icon={Database} label="باقات الكوتة" value={summary.counts.topups}
          accent="bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
          to={`/topups?tenant=${tenantId}`}
        />
        <StatCard
          icon={Activity} label="جلسات نشطة" value={summary.counts.activeSessions}
          accent="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
        />
      </div>

      {/* Tenant Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> بيانات العميل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>اسم العميل *</Label>
                <Input {...register('name', { required: 'مطلوب' })} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message as string}</p>}
              </div>
              <div className="space-y-1">
                <Label>اسم الشركة</Label>
                <Input {...register('businessName')} />
              </div>
              <div className="space-y-1">
                <Label>الـ Subdomain</Label>
                <Input {...register('subdomain')} dir="ltr" className="font-mono text-left" />
              </div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" {...register('isActive')} id="isActive" className="h-4 w-4" />
                  <Label htmlFor="isActive" className="cursor-pointer">نشط</Label>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>الوصف</Label>
              <Input {...register('description')} placeholder="ملاحظات اختيارية" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!isDirty || updateMutation.isPending} className="gap-1.5">
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </div>
            {updateMutation.isError && (
              <p className="text-xs text-destructive">
                {(updateMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* SSTP Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> بيانات اتصال SSTP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {t.sstpUsername ? (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>اسم المستخدم</Label>
                  <Input value={t.sstpUsername} readOnly dir="ltr" className="font-mono bg-muted/40" />
                </div>
                <div className="space-y-1">
                  <Label>كلمة المرور</Label>
                  <Input value={t.sstpPassword ?? ''} readOnly dir="ltr" className="font-mono bg-muted/40" />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5">
                    IP الثابت
                    {!isOwner && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Label>
                  {isOwner ? (
                    <Input
                      {...register('sstpIp')}
                      dir="ltr"
                      className="font-mono"
                      placeholder="10.100.0.10"
                    />
                  ) : (
                    <Input value={t.sstpIp ?? ''} readOnly dir="ltr" className="font-mono bg-muted/40" />
                  )}
                  {!isOwner ? (
                    <p className="text-xs text-muted-foreground">
                      الـ IP الثابت يُعدَّل من حساب المالك فقط
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      اضغط "حفظ التعديلات" في الأعلى بعد التغيير
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={downloadScript} className="gap-1.5">
                  <Download className="h-4 w-4" /> تحميل سكريبت MikroTik
                </Button>
                {isOwner && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => regenMutation.mutate()}
                      disabled={regenMutation.isPending}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {regenMutation.isPending ? 'جاري التوليد...' : 'إعادة توليد كلمة المرور'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => clearIpMutation.mutate()}
                      disabled={clearIpMutation.isPending}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      مسح الـ IP (يرجع ديناميكي)
                    </Button>
                  </>
                )}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>السكريبت يقوم بإعداد العميل على راوتر MikroTik للاتصال بسيرفر DeltaRadius عبر SSTP،</p>
                <p>ثم يضبط RADIUS تلقائياً ليستخدم القناة الآمنة. ارفعه على الراوتر عبر:</p>
                <p className="font-mono text-foreground">/import file-name=mikrotik-{t.subdomain || 'tenant'}.rsc</p>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-3">لا توجد بيانات SSTP لهذا العميل</p>
              {isOwner && (
                <Button onClick={() => regenMutation.mutate()} className="gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> توليد بيانات SSTP
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin password reset — owner only */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> إعادة تعيين كلمة مرور مدير العميل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              يُغيِّر هذا كلمة مرور حساب المدير الأساسي (SUPERADMIN) لهذا العميل.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type={showAdminPwd ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  dir="ltr"
                  placeholder="6 أحرف على الأقل"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowAdminPwd(s => !s)}
              >
                {showAdminPwd ? 'إخفاء' : 'إظهار'}
              </Button>
              <Button
                onClick={() => resetPwdMutation.mutate(adminPassword)}
                disabled={adminPassword.length < 6 || resetPwdMutation.isPending}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                {resetPwdMutation.isPending ? 'جاري الحفظ...' : 'تغيير'}
              </Button>
            </div>
            {resetPwdMutation.isSuccess && (
              <p className="text-xs text-green-600">تم تغيير كلمة المرور بنجاح</p>
            )}
            {resetPwdMutation.isError && (
              <p className="text-xs text-destructive">
                {(resetPwdMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Archive confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>أرشفة العميل</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              سيتم أرشفة العميل <strong className="text-foreground">{t.name}</strong>،
              وفصل اتصاله من MikroTik فوراً (بدون إيقاف خدمة SSTP).
            </p>
            <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded p-2">
              البيانات لا تُحذف — يمكنك استعادة العميل من قائمة "عرض المؤرشف".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="gap-1.5"
            >
              {archiveMutation.isPending ? 'جاري الأرشفة...' : 'أرشفة وفصل الاتصال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
