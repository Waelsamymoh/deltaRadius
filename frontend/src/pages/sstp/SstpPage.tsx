import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ShieldCheck, Plus, Pencil, Trash2, Wifi, RefreshCw,
  Activity, Users, Power, AlertCircle, Settings2, Save, CheckCircle2,
  Building2,
} from 'lucide-react'
import { sstpApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

// ── types ──────────────────────────────────────────────────────────────────

type SstpUser = {
  username: string; server: string; ip: string;
  source: 'tenant' | 'standalone';
  tenantId?: number;
  tenantName?: string;
}
type Session  = {
  ifname: string; username: string; ip: string
  state: string; uptime: string; rxBytes: number; txBytes: number
}
type Stat = {
  sessions: number; sstpActive: number; cpu: string; memKb: number
  uptime: string; running: boolean
}

// ── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b >= 1024)      return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

// ── schemas ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  username: z.string().min(1, 'مطلوب').regex(/^\S+$/, 'بدون مسافات'),
  password: z.string().min(1, 'مطلوب'),
  ip:       z.string().optional(),
})
const editSchema = z.object({
  password: z.string().min(1, 'مطلوب'),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm   = z.infer<typeof editSchema>

// ── Users tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SstpUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SstpUser | null>(null)

  const { data: users = [], isLoading } = useQuery<SstpUser[]>({
    queryKey: ['sstp-users'],
    queryFn: () => sstpApi.listUsers().then(r => r.data),
    refetchInterval: 10_000,
  })

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMut = useMutation({
    mutationFn: (d: CreateForm) => sstpApi.createUser(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sstp-users'] }); setCreateOpen(false); createForm.reset() },
  })
  const updateMut = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      sstpApi.updateUser(username, password),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sstp-users'] }); setEditTarget(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (username: string) => sstpApi.deleteUser(username),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sstp-users'] }); setDeleteTarget(null) },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          مستخدمو SSTP
          <Badge variant="secondary">{users.length}</Badge>
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => { createForm.reset(); setCreateOpen(true) }}>
          <Plus className="h-4 w-4" /> مستخدم جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمون بعد</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">اسم المستخدم</th>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">العميل</th>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">IP</th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isTenant = u.source === 'tenant'
                  return (
                  <tr key={u.username} className="border-b hover:bg-muted/30">
                    <td className="py-2.5 px-4 font-mono font-bold">{u.username}</td>
                    <td className="py-2.5 px-4 text-sm">
                      {isTenant ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-500 font-medium">
                          <Building2 className="h-3.5 w-3.5" />
                          {u.tenantName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">مستقل</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground font-mono text-xs">{u.ip}</td>
                    <td className="py-2.5 px-4 text-right space-x-1 rtl:space-x-reverse">
                      {isTenant ? (
                        <span className="text-[10px] text-muted-foreground italic">
                          يُدار من صفحة العملاء
                        </span>
                      ) : (
                        <>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => { editForm.reset({ password: '' }); setEditTarget(u) }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة مستخدم SSTP</DialogTitle></DialogHeader>
          <form onSubmit={createForm.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم المستخدم *</Label>
              <Input {...createForm.register('username')} dir="ltr" className="font-mono" placeholder="mikrotik1" />
              {createForm.formState.errors.username && (
                <p className="text-xs text-destructive">{createForm.formState.errors.username.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور *</Label>
              <Input {...createForm.register('password')} type="password" dir="ltr" placeholder="••••••••" />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                IP المسموح <span className="text-muted-foreground text-xs">(اتركه * للسماح بأي IP)</span>
              </Label>
              <Input {...createForm.register('ip')} dir="ltr" className="font-mono" placeholder="*" />
            </div>
            {createMut.isError && (
              <p className="text-xs text-destructive">
                {(createMut.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'جاري الإضافة...' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة مرور — {editTarget?.username}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit(d =>
              editTarget && updateMut.mutate({ username: editTarget.username, password: d.password })
            )}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>كلمة المرور الجديدة *</Label>
              <Input {...editForm.register('password')} type="password" dir="ltr" placeholder="••••••••" />
              {editForm.formState.errors.password && (
                <p className="text-xs text-destructive">{editForm.formState.errors.password.message}</p>
              )}
            </div>
            {updateMut.isError && (
              <p className="text-xs text-destructive">
                {(updateMut.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>إلغاء</Button>
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل تريد حذف المستخدم <strong className="font-mono">{deleteTarget?.username}</strong>؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.username)}
            >
              {deleteMut.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sessions tab ───────────────────────────────────────────────────────────

function SessionsTab() {
  const qc = useQueryClient()

  const { data: sessions = [], isLoading, refetch, isFetching } = useQuery<Session[]>({
    queryKey: ['sstp-sessions'],
    queryFn: () => sstpApi.sessions().then(r => r.data),
    refetchInterval: 10_000,
  })

  const { data: stat } = useQuery<Stat>({
    queryKey: ['sstp-stat'],
    queryFn: () => sstpApi.stat().then(r => r.data).catch(() => null),
    refetchInterval: 10_000,
  })

  const terminateMut = useMutation({
    mutationFn: (username: string) => sstpApi.terminate(username),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sstp-sessions'] }) },
  })

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stat && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">الجلسات النشطة</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <span className="text-2xl font-black text-primary">{stat.sessions}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">SSTP نشط</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <span className="text-2xl font-black">{stat.sstpActive}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">CPU</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <span className="text-2xl font-black">{stat.cpu}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">وقت التشغيل</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <span className="text-lg font-black">{stat.uptime}</span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          الاتصالات النشطة
          <Badge variant="secondary">{sessions.length}</Badge>
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : sessions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد اتصالات نشطة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Interface</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">المستخدم</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">IP</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">مدة الاتصال</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">تنزيل</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">رفع</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">قطع</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{s.ifname}</td>
                      <td className="py-2.5 px-4 font-bold font-mono">{s.username}</td>
                      <td className="py-2.5 px-4 font-mono text-xs">{s.ip}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant={s.state === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {s.state}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">{s.uptime}</td>
                      <td className="py-2.5 px-4 text-xs text-blue-500">{fmtBytes(s.rxBytes)}</td>
                      <td className="py-2.5 px-4 text-xs text-green-500">{fmtBytes(s.txBytes)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          disabled={terminateMut.isPending}
                          onClick={() => terminateMut.mutate(s.username)}
                          title="قطع الاتصال"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Config tab ─────────────────────────────────────────────────────────────

type SstpConfig = { gwIp: string; pool: string; dns: string; bind: string; port: string }

const configSchema = z.object({
  gwIp:  z.string().min(7, 'مطلوب'),
  pool:  z.string().min(1, 'مطلوب'),
  dns1:  z.string().min(7, 'مطلوب'),
  dns2:  z.string().min(7, 'مطلوب'),
})
type ConfigForm = z.infer<typeof configSchema>

function ConfigTab() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: cfg, isLoading } = useQuery<SstpConfig>({
    queryKey: ['sstp-config'],
    queryFn: () => sstpApi.config().then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
  })

  useEffect(() => {
    if (!cfg) return
    const dns = cfg.dns ?? ''
    const dns1 = dns.match(/dns1=(.+)/)?.[1]?.trim() ?? '8.8.8.8'
    const dns2 = dns.match(/dns2=(.+)/)?.[1]?.trim() ?? '8.8.4.4'
    reset({ gwIp: cfg.gwIp, pool: cfg.pool, dns1, dns2 })
  }, [cfg, reset])

  const saveMut = useMutation({
    mutationFn: (d: ConfigForm) =>
      sstpApi.updateConfig({ gwIp: d.gwIp, ipPool: d.pool, dns1: d.dns1, dns2: d.dns2 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sstp-config'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  return (
    <form onSubmit={handleSubmit(d => saveMut.mutate(d))}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* IP Pool card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> IP Pool
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Gateway IP</Label>
              {isLoading
                ? <div className="h-9 rounded-md bg-muted animate-pulse" />
                : <Input {...register('gwIp')} dir="ltr" className="font-mono h-9" placeholder="10.100.0.1" />}
              {errors.gwIp && <p className="text-xs text-destructive">{errors.gwIp.message}</p>}
              <p className="text-xs text-muted-foreground">الـ IP اللي بيتديه السيرفر لنفسه في كل اتصال</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">نطاق IP للعملاء</Label>
              {isLoading
                ? <div className="h-9 rounded-md bg-muted animate-pulse" />
                : <Input {...register('pool')} dir="ltr" className="font-mono h-9" placeholder="10.100.0.2-10.100.0.254" />}
              {errors.pool && <p className="text-xs text-destructive">{errors.pool.message}</p>}
              <p className="text-xs text-muted-foreground font-mono">
                مثال: 10.100.0.2-10.100.0.254
              </p>
            </div>
          </CardContent>
        </Card>

        {/* DNS card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> DNS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">DNS الأول</Label>
              {isLoading
                ? <div className="h-9 rounded-md bg-muted animate-pulse" />
                : <Input {...register('dns1')} dir="ltr" className="font-mono h-9" placeholder="8.8.8.8" />}
              {errors.dns1 && <p className="text-xs text-destructive">{errors.dns1.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">DNS الثاني</Label>
              {isLoading
                ? <div className="h-9 rounded-md bg-muted animate-pulse" />
                : <Input {...register('dns2')} dir="ltr" className="font-mono h-9" placeholder="8.8.4.4" />}
              {errors.dns2 && <p className="text-xs text-destructive">{errors.dns2.message}</p>}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3 mt-5">
        <Button type="submit" disabled={saveMut.isPending || isLoading} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMut.isPending ? 'جاري الحفظ...' : 'حفظ وتطبيق'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" /> تم الحفظ — جاري إعادة تشغيل accel-ppp
          </span>
        )}
        {saveMut.isError && (
          <span className="text-sm text-destructive">
            {(saveMut.error as any)?.response?.data?.message ?? 'حدث خطأ'}
          </span>
        )}
        <span className="text-xs text-muted-foreground mr-auto">
          تغيير الـ IP Pool يتطلب إعادة تشغيل السيرفر — الاتصالات الحالية ستنقطع
        </span>
      </div>
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SstpPage() {
  const [tab, setTab] = useState<'users' | 'sessions' | 'config'>('users')

  const { data: status } = useQuery({
    queryKey: ['sstp-status'],
    queryFn: () => sstpApi.status().then(r => r.data).catch(() => ({ running: false })),
    refetchInterval: 15_000,
  })

  const qc = useQueryClient()
  const restartMut = useMutation({
    mutationFn: () => sstpApi.restart(),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['sstp-status'] }), 3000),
  })

  const isRunning = status?.running

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2.5">
            <ShieldCheck className="h-7 w-7 text-primary" />
            SSTP VPN
          </h1>
          <p className="text-muted-foreground mt-1">إدارة مستخدمي الـ VPN ومراقبة الاتصالات</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className={`h-2.5 w-2.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={isRunning ? 'text-green-500' : 'text-red-500'}>
              {isRunning === undefined ? '...' : isRunning ? 'السيرفر يعمل' : 'السيرفر متوقف'}
            </span>
          </div>
          {!isRunning && isRunning !== undefined && (
            <Button
              size="sm" variant="outline" className="gap-1.5 text-amber-500 border-amber-500/30"
              onClick={() => restartMut.mutate()}
              disabled={restartMut.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${restartMut.isPending ? 'animate-spin' : ''}`} />
              إعادة تشغيل
            </Button>
          )}
        </div>
      </div>

      {!isRunning && isRunning !== undefined && (
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          سيرفر accel-ppp غير متاح حالياً. تحقق من حالة الخدمة بتشغيل:
          <code className="font-mono bg-black/30 px-2 py-0.5 rounded">systemctl status accel-ppp</code>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { id: 'users',    label: 'المستخدمون',      icon: Users    },
          { id: 'sessions', label: 'الاتصالات النشطة', icon: Wifi     },
          { id: 'config',   label: 'الإعدادات',        icon: Settings2 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'users'    && <UsersTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'config'   && <ConfigTab />}
    </div>
  )
}
