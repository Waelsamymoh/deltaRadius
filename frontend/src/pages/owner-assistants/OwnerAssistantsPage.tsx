import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, ShieldCheck, KeyRound, Mail, Power } from 'lucide-react'
import { ownerAssistantsApi } from '@/api/endpoints'
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
  createdAt: string
}

export default function OwnerAssistantsPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Assistant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState<string | null>(null)

  const { data: assistants = [], isLoading } = useQuery<Assistant[]>({
    queryKey: ['owner-assistants'],
    queryFn: () => ownerAssistantsApi.list().then(r => r.data),
  })

  const { data: allPermissions = [] } = useQuery<Permission[]>({
    queryKey: ['owner-assistants', 'permissions'],
    queryFn: () => ownerAssistantsApi.permissions().then(r => r.data),
  })

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm & { permissions: string[] }) => ownerAssistantsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-assistants'] })
      setCreateOpen(false)
      createForm.reset()
      setSelectedPerms(new Set())
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => ownerAssistantsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-assistants'] })
      setEditTarget(null)
      editForm.reset()
      setSelectedPerms(new Set())
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ownerAssistantsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-assistants'] })
      setDeleteTarget(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      ownerAssistantsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-assistants'] }),
  })

  const openCreate = () => {
    createForm.reset({ email: '', fullName: '', password: '' })
    setSelectedPerms(new Set())
    setFormError(null)
    setCreateOpen(true)
  }

  const openEdit = (a: Assistant) => {
    editForm.reset({ email: a.email, fullName: a.fullName ?? '', password: '' })
    setSelectedPerms(new Set(a.permissions ?? []))
    setFormError(null)
    setEditTarget(a)
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

  const permissionsForm = (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5" /> الصلاحيات
      </Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-3">
        {allPermissions.map(p => (
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
      {selectedPerms.size === 0 && (
        <p className="text-xs text-muted-foreground">
          بدون أي صلاحية لن يتمكن المساعد من الوصول لأي قسم — اختر صلاحية واحدة على الأقل.
        </p>
      )}
    </div>
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7" /> المساعدين
          </h1>
          <p className="text-muted-foreground mt-1">
            مديرين يساعدونك في إدارة النظام مع صلاحيات قابلة للضبط
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> مساعد جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            المساعدين <Badge variant="secondary" className="ml-2">{assistants.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : assistants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              لا يوجد مساعدين بعد — أضف مساعد لتقسيم المهام معك
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
            <DialogTitle>إضافة مساعد جديد</DialogTitle>
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
              <Input type="email" {...createForm.register('email')} dir="ltr" placeholder="assistant@delta-group.online" />
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
            <DialogTitle>تعديل المساعد — {editTarget?.fullName ?? editTarget?.email}</DialogTitle>
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
              <Input type="email" {...editForm.register('email')} dir="ltr" />
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
            هل أنت متأكد من حذف المساعد <strong>{deleteTarget?.email}</strong>؟
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
