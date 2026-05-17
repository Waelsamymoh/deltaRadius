import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Pencil, Trash2, UserCog, CheckCircle2, XCircle,
  Archive, ArchiveRestore, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import { adminUsersApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

// ── Permission definitions ────────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    label: 'لوحة التحكم',
    perms: [{ key: 'dashboard', label: 'عرض الرئيسية' }],
  },
  {
    label: 'المشتركون',
    perms: [
      { key: 'users.view',   label: 'عرض' },
      { key: 'users.create', label: 'إضافة' },
      { key: 'users.edit',   label: 'تعديل' },
      { key: 'users.delete', label: 'حذف' },
      { key: 'users.kick',   label: 'قطع الاتصال' },
    ],
  },
  {
    label: 'كروت الإنترنت',
    perms: [
      { key: 'cards.view',   label: 'عرض' },
      { key: 'cards.create', label: 'إنشاء' },
      { key: 'cards.edit',   label: 'تعديل' },
      { key: 'cards.delete', label: 'حذف' },
      { key: 'cards.print',  label: 'طباعة' },
    ],
  },
  {
    label: 'خطط الإنترنت',
    perms: [
      { key: 'plans.view',   label: 'عرض' },
      { key: 'plans.create', label: 'إضافة' },
      { key: 'plans.edit',   label: 'تعديل' },
      { key: 'plans.delete', label: 'حذف' },
    ],
  },
  {
    label: 'الشبكات (NAS)',
    perms: [
      { key: 'nas.view',   label: 'عرض' },
      { key: 'nas.manage', label: 'إدارة' },
    ],
  },
  {
    label: 'المحاسبة',
    perms: [{ key: 'accounting.view', label: 'عرض' }],
  },
  {
    label: 'باقات الكوتة',
    perms: [
      { key: 'topups.view',   label: 'عرض' },
      { key: 'topups.apply',  label: 'تطبيق' },
      { key: 'topups.manage', label: 'إدارة الباقات' },
    ],
  },
  {
    label: 'المجموعات',
    perms: [
      { key: 'groups.view',   label: 'عرض' },
      { key: 'groups.manage', label: 'إدارة' },
    ],
  },
]

const ALL_PERMS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key))

// ── types ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  email: z.string().min(3).regex(/^[a-zA-Z0-9_.-]+$/, 'أحرف إنجليزية وأرقام فقط'),
  password: z.string().min(6),
  fullName: z.string().optional(),
  businessName: z.string().optional(),
})
const editSchema = z.object({
  password: z.string().min(6).optional().or(z.literal('')),
  fullName: z.string().optional(),
  isActive: z.boolean().optional(),
})
type CreateForm = z.infer<typeof createSchema>
type EditForm   = z.infer<typeof editSchema>

type AdminUser = {
  id: number; email: string; fullName: string | null; role: string
  isActive: boolean; tenantId: number; archivedAt: string | null
  tenant?: { id: number; name: string }; createdAt: string; permissions?: string[]
}

type Tab = 'active' | 'archive' | 'permissions'

const roleLabel = (r: string) =>
  r === 'owner' ? 'مالك' : r === 'superadmin' ? 'مدير' : r === 'admin' ? 'مشرف' : 'بائع'

const roleBadgeVariant = (r: string) =>
  r === 'owner' ? 'destructive' : r === 'superadmin' ? 'default' : r === 'admin' ? 'secondary' : 'outline'

// ── Permissions dialog ────────────────────────────────────────────────────────

function PermissionsDialog({
  user, onClose,
}: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', user.id],
    queryFn: () => adminUsersApi.getPermissions(user.id).then(r => r.data),
  })

  const [selected, setSelected] = useState<string[]>(data?.permissions ?? [])

  const saveMutation = useMutation({
    mutationFn: (perms: string[]) => adminUsersApi.setPermissions(user.id, perms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      onClose()
    },
  })

  // Sync when data loads
  const perms = data?.permissions ?? []
  const [init, setInit] = useState(false)
  if (!init && data) { setSelected(perms); setInit(true) }

  const toggle = (key: string) =>
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every(k => selected.includes(k))
    setSelected(prev =>
      allOn ? prev.filter(k => !keys.includes(k)) : [...new Set([...prev, ...keys])]
    )
  }

  const selectAll = () => setSelected([...ALL_PERMS])
  const clearAll  = () => setSelected([])

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            صلاحيات: {user.fullName || user.email}
            <Badge variant={roleBadgeVariant(user.role) as any} className="mr-2 text-xs">
              {roleLabel(user.role)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-muted-foreground text-sm text-center py-8">جاري التحميل...</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={selectAll}>تحديد الكل</Button>
              <Button variant="outline" size="sm" onClick={clearAll}>إلغاء الكل</Button>
              <span className="text-xs text-muted-foreground mr-auto self-center">
                {selected.length} / {ALL_PERMS.length} صلاحية
              </span>
            </div>

            <div className="space-y-4">
              {PERMISSION_GROUPS.map(group => {
                const keys = group.perms.map(p => p.key)
                const allOn = keys.every(k => selected.includes(k))
                const someOn = keys.some(k => selected.includes(k))
                return (
                  <div key={group.label} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={el => { if (el) el.indeterminate = !allOn && someOn }}
                        onChange={() => toggleGroup(keys)}
                        className="h-4 w-4"
                        id={`grp-${group.label}`}
                      />
                      <Label htmlFor={`grp-${group.label}`} className="font-semibold cursor-pointer">
                        {group.label}
                      </Label>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pr-6">
                      {group.perms.map(p => (
                        <label key={p.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.includes(p.key)}
                            onChange={() => toggle(p.key)}
                            className="h-3.5 w-3.5"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => saveMutation.mutate(selected)}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const isOwner = currentUser?.role === 'owner'
  const isSuperAdmin = currentUser?.role === 'superadmin'

  const [tab, setTab] = useState<Tab>('active')
  const [createOpen,   setCreateOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<AdminUser | null>(null)
  const [permsTarget,  setPermsTarget]  = useState<AdminUser | null>(null)
  const [archiveTarget,setArchiveTarget]= useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => adminUsersApi.list().then(r => r.data),
  })
  const { data: archived = [], isLoading: archiveLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users-archived'],
    queryFn: () => adminUsersApi.archived().then(r => r.data),
    enabled: tab === 'archive',
  })

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => adminUsersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setCreateOpen(false); createForm.reset() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditForm }) => adminUsersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditTarget(null) },
  })
  const archiveMutation = useMutation({
    mutationFn: (id: number) => adminUsersApi.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-users-archived'] })
      setArchiveTarget(null)
    },
  })
  const restoreMutation = useMutation({
    mutationFn: (id: number) => adminUsersApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-users-archived'] })
    },
  })
  const permanentDeleteMutation = useMutation({
    mutationFn: (id: number) => adminUsersApi.permanentDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users-archived'] }); setDeleteTarget(null) },
  })

  const openEdit = (u: AdminUser) => {
    editForm.reset({ password: '', fullName: u.fullName ?? '', isActive: u.isActive })
    setEditTarget(u)
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })

  const pageTitle = isOwner ? 'المدراء' : isSuperAdmin ? 'المشرفون' : 'البائعون'
  const pageDesc  = isOwner
    ? 'مدير لكل عميل — كل مدير له بيانات معزولة'
    : isSuperAdmin
    ? 'إدارة المشرفين وصلاحياتهم'
    : 'إدارة البائعين وصلاحياتهم'

  function UserTable({ list, showTenant = false }: { list: AdminUser[]; showTenant?: boolean }) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم الدخول</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
            {showTenant && <th className="text-right py-2 px-3 font-medium text-muted-foreground">الحساب</th>}
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">الدور</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">الحالة</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {list.map(u => (
            <tr key={u.id} className="border-b hover:bg-muted/30">
              <td className="py-2 px-3 font-medium font-mono text-sm" dir="ltr">{u.email}</td>
              <td className="py-2 px-3 text-muted-foreground">{u.fullName ?? '—'}</td>
              {showTenant && (
                <td className="py-2 px-3 text-xs text-muted-foreground">{u.tenant?.name ?? `#${u.tenantId}`}</td>
              )}
              <td className="py-2 px-3">
                <Badge variant={roleBadgeVariant(u.role) as any} className="text-xs">
                  {roleLabel(u.role)}
                </Badge>
              </td>
              <td className="py-2 px-3">
                {u.isActive ? (
                  <span className="flex items-center gap-1 text-green-600 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" /> نشط
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive text-xs">
                    <XCircle className="h-3.5 w-3.5" /> معطّل
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-left space-x-0.5 space-x-reverse">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)} title="تعديل">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => setPermsTarget(u)} title="الصلاحيات">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={() => setArchiveTarget(u)} title="أرشفة">
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <UserCog className="h-7 w-7" /> {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1">{pageDesc}</p>
        </div>
        {tab === 'active' && (
          <Button onClick={() => { createForm.reset(); setCreateOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            {isOwner ? 'مدير جديد' : isSuperAdmin ? 'مشرف جديد' : 'بائع جديد'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['active', 'archive'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'active' && <><CheckCircle2 className="h-3.5 w-3.5" />النشطون<Badge variant="secondary" className="mr-1.5">{users.length}</Badge></>}
            {t === 'archive' && <><Archive className="h-3.5 w-3.5" />الأرشيف</>}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        isLoading ? (
          <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
        ) : users.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">لا يوجد مستخدمون بعد</CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isOwner ? 'المدراء' : isSuperAdmin ? 'المشرفون' : 'البائعون'}
                <Badge variant="secondary" className="mr-2">{users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UserTable list={users} showTenant={isSuperAdmin} />
            </CardContent>
          </Card>
        )
      )}

      {/* Archive tab */}
      {tab === 'archive' && (
        archiveLoading ? (
          <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
        ) : archived.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />الأرشيف فارغ
          </CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="h-4 w-4" /> الحسابات المؤرشفة
                <Badge variant="secondary" className="mr-1">{archived.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم الدخول</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                    {isSuperAdmin && <th className="text-right py-2 px-3 font-medium text-muted-foreground">الحساب</th>}
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">تاريخ الأرشفة</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(u => (
                    <tr key={u.id} className="border-b hover:bg-muted/30 opacity-75">
                      <td className="py-2 px-3 font-mono text-sm" dir="ltr">{u.email}</td>
                      <td className="py-2 px-3 text-muted-foreground">{u.fullName ?? '—'}</td>
                      {isSuperAdmin && <td className="py-2 px-3 text-xs text-muted-foreground">{u.tenant?.name ?? `#${u.tenantId}`}</td>}
                      <td className="py-2 px-3 text-xs text-muted-foreground">{u.archivedAt ? fmtDate(u.archivedAt) : '—'}</td>
                      <td className="py-2 px-3 text-left flex items-center gap-1 justify-end">
                        <Button variant="outline" size="sm"
                          className="h-7 px-2 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          disabled={restoreMutation.isPending}
                          onClick={() => restoreMutation.mutate(u.id)}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" /> استرجاع
                        </Button>
                        <Button variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )
      )}

      {/* Permissions dialog */}
      {permsTarget && <PermissionsDialog user={permsTarget} onClose={() => setPermsTarget(null)} />}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isOwner ? 'إضافة مدير جديد' : isSuperAdmin ? 'إضافة مشرف جديد' : 'إضافة بائع جديد'}</DialogTitle>
          </DialogHeader>
          {isOwner && (
            <p className="text-xs text-muted-foreground -mt-2">سيتم إنشاء شبكة معزولة وsubdomain خاص بهذا المدير تلقائياً.</p>
          )}
          <form onSubmit={createForm.handleSubmit(data => createMutation.mutate(data))} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم الدخول *</Label>
              <Input {...createForm.register('email')} placeholder="user1" dir="ltr" className="text-left" />
              <p className="text-xs text-muted-foreground">أحرف إنجليزية وأرقام فقط (a-z, 0-9, _ . -)</p>
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور *</Label>
              <Input type="password" {...createForm.register('password')} placeholder="••••••••" />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>الاسم <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input {...createForm.register('fullName')} placeholder="الاسم الكامل" />
            </div>
            {isOwner && (
              <div className="space-y-1">
                <Label>اسم الشركة / الشبكة *</Label>
                <Input {...createForm.register('businessName')} placeholder="Delta ISP" />
                <p className="text-xs text-muted-foreground">يُستخدم لتوليد subdomain تلقائياً (مثلاً: delta.delta-group.online)</p>
                {createForm.formState.errors.businessName && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.businessName.message}</p>
                )}
              </div>
            )}
            {createMutation.isError && (
              <p className="text-xs text-destructive">
                {(createMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل: <span dir="ltr">{editTarget?.email}</span></DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(data => {
            if (!editTarget) return
            const payload: EditForm = {}
            if (data.password) payload.password = data.password
            if (data.fullName !== undefined) payload.fullName = data.fullName
            if (data.isActive !== undefined) payload.isActive = data.isActive
            updateMutation.mutate({ id: editTarget.id, data: payload })
          })} className="space-y-4">
            <div className="space-y-1">
              <Label>الاسم</Label>
              <Input {...editForm.register('fullName')} placeholder="الاسم الكامل" />
            </div>
            <div className="space-y-1">
              <Label>كلمة مرور جديدة <span className="text-muted-foreground text-xs">(اتركها فارغة للإبقاء)</span></Label>
              <Input type="password" {...editForm.register('password')} placeholder="••••••••" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" {...editForm.register('isActive')} className="h-4 w-4" />
              <Label htmlFor="isActive" className="cursor-pointer">الحساب نشط</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>إلغاء</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm */}
      <Dialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-600" /> نقل إلى الأرشيف
          </DialogTitle></DialogHeader>
          <p className="text-sm">سيتم إخفاء حساب <strong dir="ltr">{archiveTarget?.email}</strong>.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>إلغاء</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'جاري...' : 'أرشفة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> حذف نهائي
          </DialogTitle></DialogHeader>
          <p className="text-sm">هل أنت متأكد من الحذف النهائي لـ <strong dir="ltr">{deleteTarget?.email}</strong>؟</p>
          <p className="text-xs font-medium text-destructive">⚠ لا يمكن التراجع عن هذا الإجراء.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive"
              onClick={() => deleteTarget && permanentDeleteMutation.mutate(deleteTarget.id)}
              disabled={permanentDeleteMutation.isPending}
            >
              {permanentDeleteMutation.isPending ? 'جاري الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
