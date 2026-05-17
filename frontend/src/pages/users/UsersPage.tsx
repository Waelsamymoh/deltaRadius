import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Users, Calendar, Clock, Eye, RefreshCw, Search, ChevronDown, ChevronRight, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usersApi, plansApi, topupsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

const schema = z.object({
  username:     z.string().min(1, 'مطلوب'),
  password:     z.string().min(4, 'على الأقل 4 أحرف').optional().or(z.literal('')),
  planId:       z.coerce.number().min(1, 'اختر خطة'),
  startDate:    z.string().min(1, 'مطلوب'),
  durationDays: z.coerce.number().min(1, 'مطلوب'),
  firstName:    z.string().min(1, 'مطلوب'),
  address:      z.string().optional(),
  mobile:       z.string().optional(),
  notes:        z.string().optional(),
})

const editSchema = schema.partial().extend({
  password: z.string().min(4).optional().or(z.literal('')),
})

type CreateForm = z.infer<typeof schema>
type EditForm   = z.infer<typeof editSchema>

type RadUser = {
  username:              string
  firstName:             string
  mobile:                string | null
  address:               string | null
  notes:                 string | null
  startDate:             string
  durationDays:          number
  expiresAt:             string
  remainingDays:         number
  planId:                number | null
  plan:                  { id: number; name: string } | null
  tenantId:              number | null
  tenantName:            string | null
  remainingDownloadBytes: number | null
  downloadLimitBytes:    number | null
  totalDownloadBytes:    number
  bonusTotalBytes:       number
  bonusUsedBytes:        number
  bonusRemainingBytes:   number
}

type Plan = { id: number; name: string }

const fmtBytes = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB`
  : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024).toFixed(0)} KB`

export default function UsersPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user: authUser } = useAuthStore()
  const isSuperadmin = authUser?.role === 'superadmin'
  const [collapsedTenants, setCollapsedTenants] = useState<Set<number>>(new Set())
  const [open, setOpen]         = useState(false)
  const [editing, setEditing]   = useState<RadUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renewTarget, setRenewTarget] = useState<RadUser | null>(null)
  const [renewDays, setRenewDays] = useState(30)
  const [topupTarget, setTopupTarget] = useState<RadUser | null>(null)
  const [topupPackageId, setTopupPackageId] = useState<number | ''>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery<RadUser[]>({
    queryKey: ['radius-users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => plansApi.list().then(r => r.data),
  })

  const today = new Date().toISOString().split('T')[0]

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const q = search.trim().toLowerCase()
        return (
          u.username.toLowerCase().includes(q) ||
          u.firstName.toLowerCase().includes(q) ||
          (u.mobile && u.mobile.includes(q))
        )
      })
    : users

  // Group by tenant for superadmin view
  const tenantGroups: { tenantId: number | null; tenantName: string; users: RadUser[] }[] = []
  if (isSuperadmin) {
    const map = new Map<string, { tenantId: number | null; tenantName: string; users: RadUser[] }>()
    for (const u of filteredUsers) {
      const key = String(u.tenantId ?? 'none')
      if (!map.has(key)) {
        map.set(key, {
          tenantId: u.tenantId,
          tenantName: u.tenantName ?? `حساب #${u.tenantId}`,
          users: [],
        })
      }
      map.get(key)!.users.push(u)
    }
    tenantGroups.push(...map.values())
  }

  const toggleTenant = (tenantId: number | null) => {
    const key = tenantId ?? -1
    setCollapsedTenants(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(schema),
    defaultValues: { startDate: today, durationDays: 30 },
  })

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => usersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); closeDialog() },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ username, data }: { username: string; data: EditForm }) =>
      usersApi.update(username, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); closeDialog() },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (username: string) => usersApi.remove(username),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); setDeleteTarget(null) },
  })

  const renewMutation = useMutation({
    mutationFn: ({ username, days }: { username: string; days: number }) =>
      usersApi.update(username, { startDate: today, durationDays: days }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); setRenewTarget(null) },
  })

  const { data: topupPackages = [] } = useQuery<{ id: number; name: string; sizeGb: string; price: string }[]>({
    queryKey: ['topup-packages'],
    queryFn: () => topupsApi.listPackages().then(r => r.data),
  })

  const topupMutation = useMutation({
    mutationFn: ({ username, packageId }: { username: string; packageId: number }) =>
      topupsApi.applyToUser(username, packageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radius-users'] })
      setTopupTarget(null); setTopupPackageId('')
    },
  })

  const openRenew = (u: RadUser) => {
    setRenewDays(u.durationDays)
    setRenewTarget(u)
  }

  const openCreate = () => {
    reset({ startDate: today, durationDays: 30, username: '', password: '', firstName: '' })
    setEditing(null)
    setFormError(null)
    setOpen(true)
  }

  const openEdit = (u: RadUser) => {
    editForm.reset({
      firstName:    u.firstName,
      mobile:       u.mobile ?? '',
      address:      u.address ?? '',
      notes:        u.notes ?? '',
      startDate:    u.startDate,
      durationDays: u.durationDays,
      planId:       u.planId ?? undefined,
      password:     '',
    })
    setEditing(u)
    setFormError(null)
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); setEditing(null); reset(); editForm.reset(); setFormError(null) }

  const onSubmit = (data: CreateForm) => {
    const payload = { ...data }
    if (!payload.password) delete payload.password
    createMutation.mutate(payload as CreateForm)
  }

  const onEditSubmit = (data: EditForm) => {
    if (!editing) return
    const payload: EditForm = {}
    if (data.password)                payload.password     = data.password
    if (data.planId !== undefined)    payload.planId       = data.planId
    if (data.startDate)               payload.startDate    = data.startDate
    if (data.durationDays)            payload.durationDays = data.durationDays
    if (data.firstName !== undefined) payload.firstName    = data.firstName
    if (data.address !== undefined)   payload.address      = data.address
    if (data.mobile !== undefined)    payload.mobile       = data.mobile
    if (data.notes !== undefined)     payload.notes        = data.notes
    updateMutation.mutate({ username: editing.username, data: payload })
  }

  const isExpired = (expiresAt: string) => {
    const parts = expiresAt.split(' ')
    const months: Record<string, number> = {
      Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11
    }
    const d = new Date(Number(parts[2]), months[parts[0]], Number(parts[1]))
    return d < new Date()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" /> المشتركين
          </h1>
          <p className="text-muted-foreground mt-1">إدارة مستخدمي الشبكة</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> مستخدم جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              المستخدمون{' '}
              <Badge variant="secondary" className="ml-2">
                {search.trim() ? `${filteredUsers.length} / ${users.length}` : users.length}
              </Badge>
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الموبايل أو اسم المستخدم..."
                className="pr-8 text-sm"
                dir="rtl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمون بعد</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد نتائج للبحث</p>
          ) : isSuperadmin ? (
            /* ── Superadmin grouped view ── */
            <div className="space-y-4">
              {tenantGroups.map(group => {
                const collapsed = collapsedTenants.has(group.tenantId ?? -1)
                return (
                  <div key={group.tenantId ?? 'none'} className="border rounded-lg overflow-hidden">
                    {/* Group header */}
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-right"
                      onClick={() => toggleTenant(group.tenantId)}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{group.tenantName}</span>
                        <Badge variant="secondary">{group.users.length} مشترك</Badge>
                      </div>
                      {collapsed
                        ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {/* Group table */}
                    {!collapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/20">
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المستخدم</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الخطة</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الأيام المتبقية</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الكمية المتبقية</th>
                              <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.users.map(u => <UserRow key={u.username} u={u} navigate={navigate} openEdit={openEdit} openRenew={openRenew} setDeleteTarget={setDeleteTarget} setTopupTarget={setTopupTarget} fmtBytes={fmtBytes} />)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Regular admin flat view ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المستخدم</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الخطة</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الأيام المتبقية</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الكمية المتبقية</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => <UserRow key={u.username} u={u} navigate={navigate} openEdit={openEdit} openRenew={openRenew} setDeleteTarget={setDeleteTarget} setTopupTarget={setTopupTarget} fmtBytes={fmtBytes} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={open && !editing} onOpenChange={v => { if (!v) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم المستخدم *</Label>
                <Input {...register('username')} placeholder="user01" dir="ltr" />
                {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>كلمة المرور <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                <Input type="text" {...register('password')} placeholder="اتركه فارغاً بدون باسورد" dir="ltr" />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>الاسم الأول *</Label>
              <Input {...register('firstName')} placeholder="أحمد" />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>خطة الإنترنت *</Label>
              <Select {...register('planId')}>
                <option value="">— اختر خطة —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              {errors.planId && <p className="text-xs text-destructive">{errors.planId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ البدء *</Label>
                <Input type="date" {...register('startDate')} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>المدة (بالأيام) *</Label>
                <Input type="number" {...register('durationDays')} min={1} placeholder="30" />
                {errors.durationDays && <p className="text-xs text-destructive">{errors.durationDays.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>رقم الموبايل</Label>
              <Input {...register('mobile')} placeholder="05xxxxxxxx" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input {...register('address')} placeholder="المدينة، الحي..." />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...register('notes')} placeholder="أي ملاحظات إضافية" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={v => { if (!v) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل: <span dir="ltr">{editing?.username}</span></DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-3">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-1">
              <Label>الاسم الأول</Label>
              <Input {...editForm.register('firstName')} />
            </div>
            <div className="space-y-1">
              <Label>خطة الإنترنت</Label>
              <Select {...editForm.register('planId')}>
                <option value="">— بدون تغيير —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ البدء</Label>
                <Input type="date" {...editForm.register('startDate')} />
              </div>
              <div className="space-y-1">
                <Label>المدة (أيام)</Label>
                <Input type="number" {...editForm.register('durationDays')} min={1} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>رقم الموبايل</Label>
              <Input {...editForm.register('mobile')} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input {...editForm.register('address')} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...editForm.register('notes')} />
            </div>
            <div className="space-y-1">
              <Label>كلمة مرور جديدة (اتركها فارغة للإبقاء على القديمة)</Label>
              <Input type="password" {...editForm.register('password')} placeholder="••••••••" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={!!renewTarget} onOpenChange={() => setRenewTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-600" /> تجديد اشتراك
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">المشترك: </span>
              <span className="font-medium">{renewTarget?.firstName}</span>
              <span className="font-mono text-xs text-muted-foreground mr-1">({renewTarget?.username})</span>
            </div>
            <div className="space-y-1">
              <Label>مدة التجديد (بالأيام)</Label>
              <Input
                type="number"
                min={1}
                value={renewDays}
                onChange={e => setRenewDays(Number(e.target.value))}
                className="text-center text-lg font-bold"
              />
              <p className="text-xs text-muted-foreground">
                سيبدأ من اليوم وينتهي بعد {renewDays} يوم
                ({new Date(Date.now() + renewDays * 86400000).toLocaleDateString('ar-EG')})
              </p>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              {[7, 15, 30, 60, 90].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRenewDays(d)}
                  className={`px-2 py-1 rounded border transition-colors ${renewDays === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {d}د
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTarget(null)}>إلغاء</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => renewTarget && renewMutation.mutate({ username: renewTarget.username, days: renewDays })}
              disabled={renewMutation.isPending || renewDays < 1}
            >
              {renewMutation.isPending ? 'جاري التجديد...' : `تجديد ${renewDays} يوم`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Topup Dialog */}
      <Dialog open={!!topupTarget} onOpenChange={() => { setTopupTarget(null); setTopupPackageId('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" /> إضافة كوتة لـ {topupTarget?.username}
            </DialogTitle>
          </DialogHeader>
          {topupPackages.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              لا توجد باقات كوتة. أنشئ باقة من صفحة "باقات الكوتة" أولاً.
            </div>
          ) : (
            <div className="space-y-3">
              <Label>اختر الباقة</Label>
              <Select
                value={topupPackageId}
                onChange={e => setTopupPackageId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— اختر باقة —</option>
                {topupPackages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sizeGb}GB ({Number(p.price).toFixed(2)} ج.م)
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                الكوتة المضافة تنضم إلى الحد الأصلي. لو كان المشترك على الباقة البديلة، يستعيد سرعة الخطة الأصلية.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTopupTarget(null); setTopupPackageId('') }}>إلغاء</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!topupPackageId || topupMutation.isPending}
              onClick={() => topupTarget && topupPackageId && topupMutation.mutate({ username: topupTarget.username, packageId: Number(topupPackageId) })}
            >
              {topupMutation.isPending ? 'جاري الإضافة...' : 'إضافة الكوتة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف المستخدم <strong>{deleteTarget}</strong>؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserRow({ u, navigate, openEdit, openRenew, setDeleteTarget, setTopupTarget, fmtBytes }: {
  u: RadUser
  navigate: (path: string) => void
  openEdit: (u: RadUser) => void
  openRenew: (u: RadUser) => void
  setTopupTarget: (u: RadUser) => void
  setDeleteTarget: (username: string) => void
  fmtBytes: (b: number) => string
}) {
  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="py-2 px-3 font-medium font-mono text-xs" dir="ltr">{u.username}</td>
      <td className="py-2 px-3 text-sm">{u.firstName}</td>
      <td className="py-2 px-3">
        {u.plan ? <Badge variant="outline">{u.plan.name}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      <td className="py-2 px-3">
        <span className={`text-sm font-bold ${u.remainingDays <= 0 ? 'text-destructive' : u.remainingDays <= 7 ? 'text-yellow-600' : 'text-green-600'}`}>
          {Math.max(0, u.remainingDays)} يوم
        </span>
        {u.remainingDays <= 0 && <span className="block text-xs text-destructive">منتهي</span>}
      </td>
      <td className="py-2 px-3">
        <div className="min-w-[110px] space-y-1">
          {u.remainingDownloadBytes !== null ? (
            <div>
              <span className="text-sm font-medium">{fmtBytes(u.remainingDownloadBytes)}</span>
              <div className="w-full bg-muted rounded-full h-1.5 mt-0.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500"
                  style={{ width: `${u.downloadLimitBytes ? Math.min(100, (u.remainingDownloadBytes / u.downloadLimitBytes) * 100) : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">غير محدود</span>
          )}
          {u.bonusTotalBytes > 0 && (
            <div title={`باقات إضافية: ${fmtBytes(u.bonusRemainingBytes)} من ${fmtBytes(u.bonusTotalBytes)}`}>
              <span className="text-xs font-medium text-purple-600 flex items-center gap-1">
                <span>+{fmtBytes(u.bonusRemainingBytes)}</span>
              </span>
              <div className="w-full bg-muted rounded-full h-1.5 mt-0.5">
                <div
                  className="h-1.5 rounded-full bg-purple-500"
                  style={{ width: `${Math.min(100, (u.bonusRemainingBytes / u.bonusTotalBytes) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="py-2 px-3 text-left whitespace-nowrap">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" title="عرض" onClick={() => navigate(`/users/${u.username}`)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline" size="sm"
          className="h-7 px-2 text-xs mr-1 gap-1 text-green-700 border-green-300 hover:bg-green-50"
          title="تجديد الاشتراك"
          onClick={() => openRenew(u)}
        >
          <RefreshCw className="h-3 w-3" /> تجديد
        </Button>
        <Button
          variant="outline" size="sm"
          className="h-7 px-2 text-xs mr-1 gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
          title="إضافة كوتة"
          onClick={() => setTopupTarget(u)}
        >
          <Database className="h-3 w-3" /> +كوتة
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" title="تعديل" onClick={() => openEdit(u)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => setDeleteTarget(u.username)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  )
}
