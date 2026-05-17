import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Database, Tag } from 'lucide-react'
import { topupsApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const schema = z.object({
  name: z.string().min(1, 'مطلوب'),
  sizeGb: z.coerce.number().min(0.01, 'مطلوب'),
  price: z.coerce.number().min(0).optional(),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

type TopupPackage = {
  id: number
  name: string
  sizeGb: string
  price: string
  description: string | null
}

export default function TopupsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TopupPackage | null>(null)

  const { data: pkgs = [], isLoading } = useQuery<TopupPackage[]>({
    queryKey: ['topup-packages'],
    queryFn: () => topupsApi.listPackages().then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => topupsApi.createPackage(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topup-packages'] }); closeDialog() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => topupsApi.updatePackage(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topup-packages'] }); closeDialog() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => topupsApi.removePackage(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topup-packages'] }); setDeleteTarget(null) },
  })

  const openCreate = () => {
    reset({ name: '', sizeGb: undefined, price: undefined, description: '' })
    setEditingId(null); setOpen(true)
  }
  const openEdit = (p: TopupPackage) => {
    reset({ name: p.name, sizeGb: Number(p.sizeGb), price: Number(p.price), description: p.description ?? '' })
    setEditingId(p.id); setOpen(true)
  }
  const closeDialog = () => { setOpen(false); setEditingId(null); reset() }

  const onSubmit = (data: FormData) => {
    if (editingId !== null) updateMutation.mutate({ id: editingId, data })
    else createMutation.mutate(data)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-7 w-7 text-purple-500" /> باقات الكوتة الإضافية
          </h1>
          <p className="text-muted-foreground mt-1">باقات بيانات يمكن إضافتها للمشتركين كباقات إضافية</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> باقة جديدة
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
      ) : pkgs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Database className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>لا توجد باقات إضافية. أضف باقة جديدة للبدء.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pkgs.map(p => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Database className="h-5 w-5 text-purple-500" /> {p.name}
                    </CardTitle>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">الحجم:</span>
                  <span className="font-bold text-purple-600 text-lg">{p.sizeGb} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" /> السعر:
                  </span>
                  <span className="font-semibold text-green-600">{Number(p.price).toFixed(2)} ج.م</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? 'تعديل الباقة' : 'باقة كوتة جديدة'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم الباقة</Label>
              <Input {...register('name')} placeholder="مثال: باقة 1 جيجا" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الحجم (GB)</Label>
                <Input type="number" step="0.1" min="0.1" {...register('sizeGb')} placeholder="1" />
                {errors.sizeGb && <p className="text-xs text-destructive">{errors.sizeGb.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>السعر (ج.م)</Label>
                <Input type="number" step="0.01" min="0" {...register('price')} placeholder="50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>الوصف (اختياري)</Label>
              <Input {...register('description')} placeholder="وصف الباقة" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'جاري الحفظ...' : 'حفظ'}
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
            حذف باقة <strong>{deleteTarget?.name}</strong>؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
