import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Zap, Clock, Database, Network, ShieldAlert, Gauge } from 'lucide-react'
import { plansApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// empty/blank input → null (means "no limit"); otherwise coerce to number
const optionalNum = z.preprocess(
  v => (v === '' || v === undefined || v === null) ? null : v,
  z.coerce.number().min(0).nullable(),
).optional()

const schema = z.object({
  name: z.string().min(1, 'مطلوب'),
  description: z.string().optional(),
  price: optionalNum,
  downloadMbps: optionalNum,
  uploadMbps: optionalNum,
  sessionTimeoutMin: optionalNum,
  downloadLimitGb: optionalNum,
  uploadLimitGb: optionalNum,
  totalLimitGb: optionalNum,
  burstDownloadMbps: optionalNum,
  burstUploadMbps: optionalNum,
  burstThresholdDownloadMbps: optionalNum,
  burstThresholdUploadMbps: optionalNum,
  burstTimeSeconds: optionalNum,
  framedPool: z.string().optional(),
  quotaAction: z.enum(['none', 'disconnect', 'switch']).optional(),
  fallbackPlanId: z.coerce.number().optional().nullable(),
})
type FormData = z.infer<typeof schema>

type Plan = {
  id: number
  name: string
  description: string | null
  price: string | number | null
  downloadMbps: number | null
  uploadMbps: number | null
  sessionTimeoutMin: number | null
  downloadLimitGb: number | null
  uploadLimitGb: number | null
  totalLimitGb: number | null
  burstDownloadMbps: number | null
  burstUploadMbps: number | null
  burstThresholdDownloadMbps: number | null
  burstThresholdUploadMbps: number | null
  burstTimeSeconds: number | null
  framedPool: string | null
  quotaAction: 'none' | 'disconnect' | 'switch'
  fallbackPlanId: number | null
}

function formatSpeed(mbps: number | null) {
  if (!mbps) return null
  return mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`
}

function formatTimeout(min: number | null) {
  if (!min) return null
  if (min < 60) return `${min} دقيقة`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}س ${m}د` : `${h} ساعة`
}

export default function PlansPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)

  const [searchParams] = useSearchParams()
  const tenantFilter = searchParams.get('tenant') ? Number(searchParams.get('tenant')) : null

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['plans', { tenant: tenantFilter }],
    queryFn: () => plansApi.list(tenantFilter).then(r => r.data),
  })

  const [burstEnabled, setBurstEnabled] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const quotaAction = watch('quotaAction')
  const downloadMbps = watch('downloadMbps')
  const uploadMbps = watch('uploadMbps')
  const speedDefined = (Number(downloadMbps) > 0) || (Number(uploadMbps) > 0)

  const createMutation = useMutation({
    mutationFn: (data: FormData) => plansApi.create(data, tenantFilter),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); closeDialog() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => plansApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); closeDialog() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plansApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); setDeleteTarget(null) },
  })

  const openCreate = () => {
    reset({ name: '', description: '', price: undefined, downloadMbps: undefined, uploadMbps: undefined, sessionTimeoutMin: undefined, downloadLimitGb: undefined, uploadLimitGb: undefined, totalLimitGb: undefined, burstDownloadMbps: undefined, burstUploadMbps: undefined, burstThresholdDownloadMbps: undefined, burstThresholdUploadMbps: undefined, burstTimeSeconds: undefined, framedPool: '', quotaAction: 'none', fallbackPlanId: null })
    setBurstEnabled(false)
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (p: Plan) => {
    reset({
      name: p.name,
      description: p.description ?? '',
      price: p.price != null ? Number(p.price) : undefined,
      downloadMbps: p.downloadMbps ?? undefined,
      uploadMbps: p.uploadMbps ?? undefined,
      sessionTimeoutMin: p.sessionTimeoutMin ?? undefined,
      downloadLimitGb: p.downloadLimitGb ?? undefined,
      uploadLimitGb: p.uploadLimitGb ?? undefined,
      totalLimitGb: p.totalLimitGb ?? undefined,
      burstDownloadMbps: p.burstDownloadMbps ?? undefined,
      burstUploadMbps: p.burstUploadMbps ?? undefined,
      burstThresholdDownloadMbps: p.burstThresholdDownloadMbps ?? undefined,
      burstThresholdUploadMbps: p.burstThresholdUploadMbps ?? undefined,
      burstTimeSeconds: p.burstTimeSeconds ?? undefined,
      framedPool: p.framedPool ?? '',
      quotaAction: p.quotaAction ?? 'none',
      fallbackPlanId: p.fallbackPlanId ?? null,
    })
    setBurstEnabled(!!(p.burstDownloadMbps || p.burstUploadMbps))
    setEditingId(p.id)
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); setEditingId(null); reset() }

  const onSubmit = (data: FormData) => {
    const payload: any = { ...data }
    if (!burstEnabled) {
      payload.burstDownloadMbps = null
      payload.burstUploadMbps = null
      payload.burstThresholdDownloadMbps = null
      payload.burstThresholdUploadMbps = null
      payload.burstTimeSeconds = null
    }
    // Auto-default quota_action when a quota is set but action is "none"
    const hasQuota = !!(payload.totalLimitGb || payload.downloadLimitGb || payload.uploadLimitGb)
    if (hasQuota && (!payload.quotaAction || payload.quotaAction === 'none')) {
      payload.quotaAction = 'disconnect'
    }
    if (editingId !== null) updateMutation.mutate({ id: editingId, data: payload })
    else createMutation.mutate(payload)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-7 w-7 text-yellow-500" />
            خطط الإنترنت
          </h1>
          <p className="text-muted-foreground mt-1">إدارة خطط السرعة والبيانات لـ MikroTik</p>
          {tenantFilter && (
            <Link
              to={`/tenants/${tenantFilter}`}
              className="inline-flex items-center gap-1.5 mt-2 text-xs bg-primary/15 text-primary border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
            >
              العودة للوحة العميل
            </Link>
          )}
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> خطة جديدة
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>لا توجد خطط بعد. أضف خطة جديدة للبدء.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    {p.price != null && (
                      <p className="text-sm font-bold text-primary mt-0.5">{Number(p.price).toFixed(2)} ج.م</p>
                    )}
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Speed */}
                {(p.downloadMbps || p.uploadMbps) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
                    <span>
                      <span className="text-blue-600 font-medium">↓ {formatSpeed(p.downloadMbps) ?? '—'}</span>
                      <span className="mx-1 text-muted-foreground">/</span>
                      <span className="text-green-600 font-medium">↑ {formatSpeed(p.uploadMbps) ?? '—'}</span>
                    </span>
                  </div>
                )}
                {/* Burst */}
                {(p.burstDownloadMbps || p.burstUploadMbps) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Gauge className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      Burst: <span className="text-blue-500">↓ {formatSpeed(p.burstDownloadMbps)}</span>
                      <span className="mx-1">/</span>
                      <span className="text-green-500">↑ {formatSpeed(p.burstUploadMbps)}</span>
                      {p.burstTimeSeconds ? <span className="ml-1">({p.burstTimeSeconds}s)</span> : null}
                    </span>
                  </div>
                )}
                {/* Session timeout */}
                {p.sessionTimeoutMin ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                    <span>مدة الجلسة: <span className="font-medium">{formatTimeout(p.sessionTimeoutMin)}</span></span>
                  </div>
                ) : null}
                {/* Data quota */}
                {p.totalLimitGb ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="font-medium text-purple-600">⇅ {p.totalLimitGb} GB إجمالي</span>
                  </div>
                ) : (p.downloadLimitGb || p.uploadLimitGb) ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-purple-500 shrink-0" />
                    <span>
                      {p.downloadLimitGb ? <span className="text-blue-600">↓ {p.downloadLimitGb} GB</span> : null}
                      {p.downloadLimitGb && p.uploadLimitGb ? <span className="mx-1 text-muted-foreground">/</span> : null}
                      {p.uploadLimitGb ? <span className="text-green-600">↑ {p.uploadLimitGb} GB</span> : null}
                    </span>
                  </div>
                ) : null}
                {/* IP Pool */}
                {p.framedPool && (
                  <div className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-cyan-500 shrink-0" />
                    <span>Pool: <Badge variant="outline" className="text-xs">{p.framedPool}</Badge></span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? 'تعديل الخطة' : 'إضافة خطة جديدة'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">

            {/* Name + Price + Description */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>اسم الخطة</Label>
                <Input {...register('name')} placeholder="خطة 10 ميجا" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>السعر (ج.م)</Label>
                <Input type="number" step="0.01" min="0" {...register('price')} placeholder="250" />
              </div>
              <div className="space-y-1">
                <Label>الوصف (اختياري)</Label>
                <Input {...register('description')} placeholder="وصف الخطة" />
              </div>
            </div>

            {/* Speed + Session + Pool */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><span className="text-blue-600">↓</span> تحميل (Mbps)</Label>
                <Input type="number" step="0.1" min="0" {...register('downloadMbps')} placeholder="10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><span className="text-green-600">↑</span> رفع (Mbps)</Label>
                <Input type="number" step="0.1" min="0" {...register('uploadMbps')} placeholder="2" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3 text-orange-500" /> مدة الجلسة (د)</Label>
                <Input type="number" min="0" {...register('sessionTimeoutMin')} placeholder="فارغ = غير محدود" />
              </div>
            </div>

            {/* Burst Mode */}
            <div className="border rounded-md bg-muted/30">
              <label className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={burstEnabled}
                  disabled={!speedDefined}
                  onChange={e => {
                    setBurstEnabled(e.target.checked)
                    if (!e.target.checked) {
                      setValue('burstDownloadMbps', undefined)
                      setValue('burstUploadMbps', undefined)
                      setValue('burstThresholdDownloadMbps', undefined)
                      setValue('burstThresholdUploadMbps', undefined)
                      setValue('burstTimeSeconds', undefined)
                    }
                  }}
                  className="h-4 w-4 accent-blue-500"
                />
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Gauge className="h-4 w-4 text-blue-500" /> Burst Mode
                </span>
                {!speedDefined && (
                  <span className="text-xs text-muted-foreground mr-auto">يجب تحديد سرعة أولاً</span>
                )}
              </label>
              {burstEnabled && speedDefined && (
                <div className="px-3 pb-3 border-t pt-2 grid grid-cols-5 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs"><span className="text-blue-600">↓</span> Burst تحميل</Label>
                    <Input type="number" step="0.1" min="0" {...register('burstDownloadMbps')} placeholder="20" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs"><span className="text-green-600">↑</span> Burst رفع</Label>
                    <Input type="number" step="0.1" min="0" {...register('burstUploadMbps')} placeholder="4" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs"><span className="text-blue-600">↓</span> Threshold تحميل</Label>
                    <Input type="number" step="0.1" min="0" {...register('burstThresholdDownloadMbps')} placeholder="افتراضي" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs"><span className="text-green-600">↑</span> Threshold رفع</Label>
                    <Input type="number" step="0.1" min="0" {...register('burstThresholdUploadMbps')} placeholder="افتراضي" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">مدة (ثانية)</Label>
                    <Input type="number" min="1" {...register('burstTimeSeconds')} placeholder="8" />
                  </div>
                </div>
              )}
            </div>

            {/* Quota */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Database className="h-3 w-3 text-purple-500" /> إجمالي كوتا (GB)</Label>
                <Input type="number" step="0.1" min="0" {...register('totalLimitGb')} placeholder="فارغ = غير محدود" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><span className="text-blue-600">↓</span> حد تحميل (GB)</Label>
                <Input type="number" step="0.1" min="0" {...register('downloadLimitGb')} placeholder="فارغ = غير محدود" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><span className="text-green-600">↑</span> حد رفع (GB)</Label>
                <Input type="number" step="0.1" min="0" {...register('uploadLimitGb')} placeholder="فارغ = غير محدود" />
              </div>
            </div>

            {/* Pool + Quota Action */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Network className="h-3 w-3 text-cyan-500" /> IP Pool (اختياري)</Label>
                <Input {...register('framedPool')} placeholder="dhcp-pool" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-orange-500" /> بعد انتهاء الكوتا</Label>
                <Select {...register('quotaAction')}>
                  <option value="none">لا شيء</option>
                  <option value="disconnect">قطع الإنترنت</option>
                  <option value="switch">تحويل لخطة أخرى</option>
                </Select>
              </div>
            </div>
            {quotaAction === 'switch' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">الخطة البديلة</Label>
                <Select {...register('fallbackPlanId')}>
                  <option value="">— اختر خطة —</option>
                  {plans.filter(p => p.id !== editingId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'جاري الحفظ...' : 'حفظ'}
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
            هل أنت متأكد من حذف خطة <strong>{deleteTarget?.name}</strong>؟ سيتم حذف سمات RADIUS المرتبطة بها أيضاً.
          </p>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(deleteMutation.error as any)?.response?.data?.message ?? 'تعذّر الحذف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
