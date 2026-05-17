import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Server, Radio, WifiOff, Loader2, Users, AlertCircle } from 'lucide-react'
import { nasApi } from '@/api/endpoints'
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
  nasname: z.string().min(1, 'مطلوب'),
  shortname: z.string().optional(),
  secret: z.string().min(1, 'مطلوب'),
  type: z.string().optional(),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

type Nas = {
  id: number
  nasname: string
  shortname: string | null
  secret: string
  type: string | null
  description: string | null
}

type CheckResult = {
  connected: boolean
  activeSessions: number
  totalSessions: number
  lastSeen: string | null
  status: string
  radiusRunning: boolean
  clientRegistered: boolean
}

export default function NasPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Nas | null>(null)
  const [checkResults, setCheckResults] = useState<Record<number, CheckResult | 'loading'>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const { data: nasList = [], isLoading } = useQuery<Nas[]>({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => nasApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nas'] }); closeDialog() },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      setFormError(typeof msg === 'string' ? msg : 'حدث خطأ')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => nasApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nas'] }); closeDialog() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => nasApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nas'] }); setDeleteTarget(null) },
  })

  const handleCheck = async (id: number) => {
    setCheckResults(p => ({ ...p, [id]: 'loading' }))
    try {
      const res = await nasApi.check(id)
      setCheckResults(p => ({ ...p, [id]: res.data }))
    } catch {
      setCheckResults(p => ({ ...p, [id]: { connected: false, activeSessions: 0, totalSessions: 0, lastSeen: null, status: 'خطأ في الاتصال' } }))
    }
  }

  const openCreate = () => {
    reset({ nasname: '', shortname: '', secret: '', type: 'mikrotik', description: '' })
    setFormError(null)
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (n: Nas) => {
    reset({
      nasname: n.nasname,
      shortname: n.shortname ?? '',
      secret: n.secret,
      type: n.type ?? 'mikrotik',
      description: n.description ?? '',
    })
    setEditingId(n.id)
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); setEditingId(null); reset(); setFormError(null) }

  const onSubmit = (data: FormData) => {
    if (editingId !== null) updateMutation.mutate({ id: editingId, data })
    else createMutation.mutate(data)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-7 w-7" /> الشبكات
          </h1>
          <p className="text-muted-foreground mt-1">إدارة نقاط الوصول والموجّهات</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> جهاز جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            الأجهزة <Badge variant="secondary" className="ml-2">{nasList.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : nasList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد شبكات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">IP / المضيف</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم المختصر</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">النوع</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">حالة RADIUS</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {nasList.map((n) => {
                    const check = checkResults[n.id]
                    return (
                      <tr key={n.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium font-mono">{n.nasname}</td>
                        <td className="py-2 px-3 text-muted-foreground">{n.shortname ?? '—'}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline">{n.type ?? 'other'}</Badge>
                        </td>
                        <td className="py-2 px-3">
                          {!check ? (
                            <span className="text-muted-foreground text-xs">لم يُفحص</span>
                          ) : check === 'loading' ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> جاري الفحص...
                            </span>
                          ) : check.connected ? (
                            <div className="space-y-0.5">
                              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                <Radio className="h-3.5 w-3.5" /> متصل بـ RADIUS
                              </span>
                              <span className="text-xs text-muted-foreground">{check.status}</span>
                              {check.activeSessions > 0 && (
                                <span className="flex items-center gap-1 text-xs text-blue-600">
                                  <Users className="h-3 w-3" /> {check.activeSessions} جلسة نشطة
                                </span>
                              )}
                            </div>
                          ) : !check.radiusRunning ? (
                            <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                              <AlertCircle className="h-3.5 w-3.5" /> خادم RADIUS غير مشغّل
                            </span>
                          ) : !check.clientRegistered ? (
                            <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                              <AlertCircle className="h-3.5 w-3.5" /> غير مسجّل في RADIUS
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium">
                                <WifiOff className="h-3.5 w-3.5" /> مسجّل — في انتظار أول اتصال
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {check.status}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-left">
                          <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-xs mr-1 gap-1"
                            disabled={check === 'loading'}
                            onClick={() => handleCheck(n.id)}
                          >
                            {check === 'loading'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Radio className="h-3 w-3" />}
                            فحص
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEdit(n)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(n)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
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
            <DialogTitle>{editingId !== null ? 'تعديل جهاز NAS' : 'إضافة جهاز NAS'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-1">
              <Label>عنوان IP / اسم المضيف</Label>
              <Input {...register('nasname')} placeholder="192.168.1.1" />
              {errors.nasname && <p className="text-xs text-destructive">{errors.nasname.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>الاسم المختصر (اختياري)</Label>
              <Input {...register('shortname')} placeholder="router-01" />
            </div>
            <div className="space-y-1">
              <Label>كلمة السر المشتركة (Shared Secret)</Label>
              <Input {...register('secret')} placeholder="testing123" />
              {errors.secret && <p className="text-xs text-destructive">{errors.secret.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>نوع الجهاز</Label>
              <Select {...register('type')}>
                <option value="mikrotik">MikroTik</option>
                <option value="other">أخرى (other)</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الوصف (اختياري)</Label>
              <Input {...register('description')} placeholder="وصف الجهاز" />
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

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف الجهاز <strong>{deleteTarget?.nasname}</strong>؟
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
