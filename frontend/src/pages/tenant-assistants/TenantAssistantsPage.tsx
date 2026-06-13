import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, ShieldCheck, KeyRound, Mail, Power } from 'lucide-react'
import { tenantAssistantsApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

const createSchema = z.object({
  email: z.string().email('بريد غير صحيح'),
  fullName: z.string().optional(),
  password: z.string().min(6, '6 أحرف على الأقل'),
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  email: z.string().email('بريد غير صحيح'),
  fullName: z.string().optional(),
  password: z.string().optional().or(z.literal('')),
})
type EditForm = z.infer<typeof editSchema>

type Permission = { key: string; label: string }
type Assistant = {
  id: number
  email: string
  fullName: string | null
  isActive: boolean
  permissions: string[] | null
  tenantId: number | null
  createdAt: string
}

// Per-tenant email suffix: derived from the current subdomain so every
// supervisor's email lives under the tenant's own namespace, e.g.
// "ahmed@mahmoud.com" when accessed from mahmoud.delta-group.online.
const tenantSubdomain = (() => {
  const host = window.location.hostname
  // Raw IP → no tenant subdomain (dev/admin)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null
  const parts = host.split('.')
  // Same logic as App.tsx getAppContext: subdomain only matters when host has
  // 3+ segments and isn't the apex/www/admin.
  if (parts.length < 3 || parts[0] === 'www' || parts[0] === 'admin') return null
  return parts[0]
})()
const EMAIL_SUFFIX = tenantSubdomain ? `@${tenantSubdomain}.com` : ''

/** Strip the auto-suffix (and anything past an `@`) so we always store a
 *  bare local-part in the prefix state. */
const toPrefix = (raw: string): string => raw.replace(/[@\s].*$/, '').trim()
/** Pull the local-part from an existing email if it ends with our suffix,
 *  otherwise fall back to the bit before the @. */
const splitPrefix = (email: string): string => {
  if (!email) return ''
  if (EMAIL_SUFFIX && email.endsWith(EMAIL_SUFFIX)) {
    return email.slice(0, -EMAIL_SUFFIX.length)
  }
  return email.split('@')[0] ?? ''
}

export default function TenantAssistantsPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Assistant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState<string | null>(null)
  const [createPrefix, setCreatePrefix] = useState('')
  const [editPrefix, setEditPrefix]     = useState('')

  const { data: assistants = [], isLoading } = useQuery<Assistant[]>({
    queryKey: ['tenant-assistants'],
    queryFn: () => tenantAssistantsApi.list().then(r => r.data),
  })

  const { data: allPermissions = [] } = useQuery<Permission[]>({
    queryKey: ['tenant-assistants', 'permissions'],
    queryFn: () => tenantAssistantsApi.permissions().then(r => r.data),
  })

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm & { permissions: string[] }) => tenantAssistantsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-assistants'] })
      setCreateOpen(false)
      createForm.reset()
      setSelectedPerms(new Set())
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => tenantAssistantsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-assistants'] })
      setEditTarget(null)
      editForm.reset()
      setSelectedPerms(new Set())
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tenantAssistantsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-assistants'] })
      setDeleteTarget(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      tenantAssistantsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-assistants'] }),
  })

  const openCreate = () => {
    createForm.reset({ email: '', fullName: '', password: '' })
    setCreatePrefix('')
    setSelectedPerms(new Set())
    setFormError(null)
    setCreateOpen(true)
  }

  const openEdit = (a: Assistant) => {
    editForm.reset({ email: a.email, fullName: a.fullName ?? '', password: '' })
    setEditPrefix(splitPrefix(a.email))
    setSelectedPerms(new Set(a.permissions ?? []))
    setFormError(null)
    setEditTarget(a)
  }

  /** Keep the prefix state and the rhf-managed email field in sync — the prefix
   *  is what the user types, the email field is what gets validated/submitted. */
  const updateCreatePrefix = (v: string) => {
    const clean = toPrefix(v)
    setCreatePrefix(clean)
    createForm.setValue('email', clean ? `${clean}${EMAIL_SUFFIX}` : '', { shouldValidate: !!clean })
  }
  const updateEditPrefix = (v: string) => {
    const clean = toPrefix(v)
    setEditPrefix(clean)
    editForm.setValue('email', clean ? `${clean}${EMAIL_SUFFIX}` : '', { shouldValidate: !!clean })
  }

  const togglePerm = (key: string) => {
    setSelectedPerms(s => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onCreate = (data: CreateForm) => {
    createMutation.mutate({ ...data, permissions: Array.from(selectedPerms) })
  }

  const onEdit = (data: EditForm) => {
    if (!editTarget) return
    const payload: any = {
      email: data.email,
      fullName: data.fullName ?? '',
      permissions: Array.from(selectedPerms),
    }
    if (data.password) payload.password = data.password
    updateMutation.mutate({ id: editTarget.id, data: payload })
  }

  // Group permissions by resource (prefix before `.`) so the UI shows
  // tidy sections like "المشتركين" instead of a flat checkbox dump.
  const groupTitles: Record<string, string> = {
    users:      'المشتركين',
    nas:        'أجهزة NAS',
    plans:      'خطط الإنترنت',
    topups:     'باقات الكوتة',
    cards:      'كروت الإنترنت',
    accounting: 'المحاسبة',
  }
  const groupedPerms = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const group = p.key.split('.')[0]
    if (!acc[group]) acc[group] = []
    acc[group].push(p)
    return acc
  }, {})

  const permissionsForm = (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5" /> الصلاحيات
      </Label>
      <div className="space-y-3 rounded-md border p-3">
        {Object.entries(groupedPerms).map(([group, perms]) => (
          <div key={group} className="space-y-1.5">
            <div className="text-xs font-bold text-muted-foreground border-b pb-1">
              {groupTitles[group] ?? group}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pr-1">
              {perms.map(p => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/30 px-2 py-1 rounded"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selectedPerms.has(p.key)}
                    onChange={() => togglePerm(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selectedPerms.size === 0 && (
        <p className="text-xs text-muted-foreground">
          بدون أي صلاحية لن يتمكن المشرف من الوصول لأي قسم — اختر صلاحية واحدة على الأقل.
        </p>
      )}
    </div>
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7" /> المشرفون
          </h1>
          <p className="text-muted-foreground mt-1">
            مشرفون يساعدونك في إدارة الشبكة — لكل واحد اسم دخول وصلاحيات خاصة به
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> مشرف جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            المشرفون <Badge variant="secondary" className="ml-2">{assistants.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : assistants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              لا يوجد مشرفون بعد — أضف مشرف لتقسيم المهام
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">البريد</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الصلاحيات</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {assistants.map(a => (
                    <tr key={a.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 text-muted-foreground">{a.id}</td>
                      <td className="py-2 px-3 font-medium">{a.fullName ?? '—'}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{a.email}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(a.permissions ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">بدون صلاحيات</span>
                          ) : (
                            (a.permissions ?? []).map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {allPermissions.find(x => x.key === p)?.label ?? p}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={a.isActive ? 'default' : 'secondary'}>
                          {a.isActive ? 'نشط' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 mr-1"
                          title={a.isActive ? 'إيقاف' : 'تفعيل'}
                          onClick={() => toggleActiveMutation.mutate({ id: a.id, isActive: !a.isActive })}
                        >
                          <Power className={`h-3.5 w-3.5 ${a.isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة مشرف جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-1">
              <Label>الاسم</Label>
              <Input {...createForm.register('fullName')} placeholder="محمد أحمد" />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> البريد الإلكتروني *</Label>
              {EMAIL_SUFFIX ? (
                <div dir="ltr" className="flex items-stretch rounded-md border focus-within:ring-2 focus-within:ring-ring overflow-hidden">
                  <input
                    type="text"
                    value={createPrefix}
                    onChange={e => updateCreatePrefix(e.target.value)}
                    dir="ltr"
                    placeholder="اسم المستخدم"
                    className="flex-1 px-3 py-2 text-sm bg-background outline-none"
                  />
                  <span className="px-3 py-2 text-sm bg-muted text-muted-foreground border-l font-mono whitespace-nowrap select-none">
                    {EMAIL_SUFFIX}
                  </span>
                </div>
              ) : (
                <Input type="email" {...createForm.register('email')} dir="ltr" placeholder="supervisor@example.com" />
              )}
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور *</Label>
              <Input type="text" {...createForm.register('password')} dir="ltr" placeholder="6 أحرف على الأقل" />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            {permissionsForm}
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
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل المشرف — {editTarget?.fullName ?? editTarget?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-1">
              <Label>الاسم</Label>
              <Input {...editForm.register('fullName')} />
            </div>
            <div className="space-y-1">
              <Label>البريد الإلكتروني</Label>
              {EMAIL_SUFFIX ? (
                <div dir="ltr" className="flex items-stretch rounded-md border focus-within:ring-2 focus-within:ring-ring overflow-hidden">
                  <input
                    type="text"
                    value={editPrefix}
                    onChange={e => updateEditPrefix(e.target.value)}
                    dir="ltr"
                    placeholder="اسم المستخدم"
                    className="flex-1 px-3 py-2 text-sm bg-background outline-none"
                  />
                  <span className="px-3 py-2 text-sm bg-muted text-muted-foreground border-l font-mono whitespace-nowrap select-none">
                    {EMAIL_SUFFIX}
                  </span>
                </div>
              ) : (
                <Input type="email" {...editForm.register('email')} dir="ltr" />
              )}
            </div>
            <div className="space-y-1">
              <Label>
                كلمة مرور جديدة
                <span className="text-muted-foreground text-xs mr-1">(اتركها فارغة للإبقاء)</span>
              </Label>
              <Input type="password" {...editForm.register('password')} dir="ltr" placeholder="••••••••" />
            </div>
            {permissionsForm}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>إلغاء</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف المشرف <strong>{deleteTarget?.email}</strong>؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
