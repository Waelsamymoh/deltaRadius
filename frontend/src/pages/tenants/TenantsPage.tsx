import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Building2, KeyRound } from 'lucide-react'
import { tenantsApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

const schema = z.object({
  name: z.string().min(1, 'مطلوب'),
  subdomain: z.string().optional(),
  businessName: z.string().optional(),
  adminPassword: z.string().min(6).optional().or(z.literal('')),
})
type FormData = z.infer<typeof schema>

type Tenant = {
  id: number
  name: string
  subdomain: string | null
  businessName: string | null
  isActive: boolean
  createdAt: string
}

export default function TenantsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: () => tenantsApi.list().then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => tenantsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); closeDialog() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => tenantsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); closeDialog() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setDeleteTarget(null) },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      tenantsApi.resetAdminPassword(id, password),
  })

  const openCreate = () => { reset({ name: '', subdomain: '', businessName: '' }); setEditingId(null); setOpen(true) }
  const openEdit = (t: Tenant) => {
    reset({ name: t.name, subdomain: t.subdomain ?? '', businessName: t.businessName ?? '' })
    setEditingId(t.id)
    setOpen(true)
  }
  const closeDialog = () => { setOpen(false); setEditingId(null); reset() }

  const onSubmit = async (data: FormData) => {
    const { adminPassword, ...tenantData } = data
    if (editingId !== null) {
      await updateMutation.mutateAsync({ id: editingId, data: tenantData })
      if (adminPassword) await resetPasswordMutation.mutateAsync({ id: editingId, password: adminPassword })
    } else {
      createMutation.mutate(tenantData)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7" /> العملاء
          </h1>
          <p className="text-muted-foreground mt-1">إدارة حسابات العملاء وشبكاتهم المعزولة</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> عميل جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            العملاء <Badge variant="secondary" className="ml-2">{tenants.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : tenants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد عملاء بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">اسم الشركة</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الـ Subdomain</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">تاريخ الإنشاء</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 text-muted-foreground">{t.id}</td>
                      <td className="py-2 px-3 font-medium">{t.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{t.businessName ?? '—'}</td>
                      <td className="py-2 px-3 font-mono text-xs text-blue-600 dark:text-blue-400">
                        {t.subdomain ? `${t.subdomain}.delta-group.online` : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={t.isActive ? 'default' : 'secondary'}>
                          {t.isActive ? 'نشط' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {new Date(t.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
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

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? 'تعديل العميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم العميل (للنظام) *</Label>
              <Input {...register('name')} placeholder="شركة المستقبل" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>اسم الشركة / الشبكة <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input {...register('businessName')} placeholder="Future ISP" />
            </div>
            <div className="space-y-1">
              <Label>الـ Subdomain <span className="text-muted-foreground text-xs">(اختياري — يُولَّد تلقائياً)</span></Label>
              <Input {...register('subdomain')} placeholder="future" dir="ltr" className="text-left font-mono" />
              <p className="text-xs text-muted-foreground">مثال: future → future.delta-group.online</p>
            </div>
            {editingId !== null && (
              <div className="space-y-1 border-t pt-4">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  كلمة مرور المدير <span className="text-muted-foreground text-xs">(اتركها فارغة للإبقاء)</span>
                </Label>
                <Input type="password" {...register('adminPassword')} placeholder="••••••••" dir="ltr" />
                {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword.message}</p>}
              </div>
            )}
            {(updateMutation.isError || resetPasswordMutation.isError) && (
              <p className="text-xs text-destructive">
                {(updateMutation.error as any)?.response?.data?.message ??
                 (resetPasswordMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting || updateMutation.isPending || resetPasswordMutation.isPending}>
                {(isSubmitting || updateMutation.isPending || resetPasswordMutation.isPending) ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف العميل <strong>{deleteTarget?.name}</strong>؟ سيُحذف جميع بيانات العميل.
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
