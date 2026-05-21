import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Building2, Download, ExternalLink, Archive, ArchiveRestore } from 'lucide-react'
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
})
type FormData = z.infer<typeof schema>

type Tenant = {
  id: number
  name: string
  subdomain: string | null
  businessName: string | null
  isActive: boolean
  isArchived: boolean
  createdAt: string
  sstpUsername: string | null
  sstpIp: string | null
  /** Static IPs assigned to this tenant's NAS devices (one per device) */
  nasIps: string[]
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

export default function TenantsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Tenant | null>(null)
  const [permanentTarget, setPermanentTarget] = useState<Tenant | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['tenants', { showArchived }],
    queryFn: () => tenantsApi.list(showArchived).then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => tenantsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); closeDialog() },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.archive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setArchiveTarget(null) },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })

  const permanentMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.removePermanent(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setPermanentTarget(null) },
  })

  const openCreate = () => {
    reset({ name: '', subdomain: '', businessName: '' })
    setOpen(true)
  }
  const closeDialog = () => { setOpen(false); reset() }

  const onSubmit = (data: FormData) => createMutation.mutate(data)

  const downloadScript = async (t: Tenant) => {
    const res = await tenantsApi.downloadMikrotikScript(t.id)
    downloadBlob(res.data, `mikrotik-${t.subdomain || t.name}.rsc`)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7" /> العملاء
          </h1>
          <p className="text-muted-foreground mt-1">إدارة حسابات العملاء وشبكاتهم المعزولة — انقر على أي عميل لفتح لوحة التحكم الخاصة به</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> عميل جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">
              {showArchived ? 'العملاء (شامل المؤرشف)' : 'العملاء'}
              <Badge variant="secondary" className="ml-2">{tenants.length}</Badge>
            </CardTitle>
            <Button
              variant={showArchived ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowArchived(s => !s)}
            >
              <Archive className="h-3.5 w-3.5" />
              {showArchived ? 'إخفاء المؤرشف' : 'عرض المؤرشف'}
            </Button>
          </div>
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
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">SSTP User</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">IP الثابت</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">تاريخ الإنشاء</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b hover:bg-muted/30 cursor-pointer ${t.isArchived ? 'opacity-60' : ''}`}
                      onClick={() => navigate(`/tenants/${t.id}`)}
                    >
                      <td className="py-2 px-3 text-muted-foreground">{t.id}</td>
                      <td className="py-2 px-3 font-medium flex items-center gap-1.5">
                        {t.name}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{t.businessName ?? '—'}</td>
                      <td className="py-2 px-3 font-mono text-xs text-blue-600 dark:text-blue-400">
                        {t.subdomain ? `${t.subdomain}.delta-group.online` : '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                        {t.sstpUsername ?? '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">
                        {t.nasIps && t.nasIps.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.nasIps.slice(0, 2).map(ip => (
                              <span key={ip} className="text-primary font-semibold">{ip}</span>
                            ))}
                            {t.nasIps.length > 2 && (
                              <span className="text-muted-foreground">+{t.nasIps.length - 2}</span>
                            )}
                          </div>
                        ) : t.sstpIp ? (
                          <span className="text-primary font-semibold">{t.sstpIp}</span>
                        ) : (
                          <span className="text-muted-foreground">لا يوجد NAS</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {t.isArchived
                          ? <Badge variant="outline" className="gap-1 text-muted-foreground"><Archive className="h-3 w-3" />مؤرشف</Badge>
                          : <Badge variant={t.isActive ? 'default' : 'secondary'}>
                              {t.isActive ? 'نشط' : 'موقوف'}
                            </Badge>
                        }
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {new Date(t.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td
                        className="py-2 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.sstpUsername && !t.isArchived && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 mr-1 text-blue-600 hover:text-blue-700"
                            title="تحميل سكريبت MikroTik"
                            onClick={() => downloadScript(t)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1"
                          title="فتح لوحة التحكم"
                          onClick={() => navigate(`/tenants/${t.id}`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {t.isArchived ? (
                          <>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 mr-1 text-emerald-500 hover:text-emerald-400"
                              title="استعادة العميل"
                              onClick={() => restoreMutation.mutate(t.id)}
                              disabled={restoreMutation.isPending}
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="حذف نهائي"
                              onClick={() => setPermanentTarget(t)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-amber-500 hover:text-amber-400"
                            title="أرشفة (يقطع اتصاله من MikroTik)"
                            onClick={() => setArchiveTarget(t)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog — minimal: SSTP creds auto-generated server-side */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة عميل / شبكة جديدة</DialogTitle>
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
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              سيتم توليد بيانات SSTP (اسم مستخدم + كلمة مرور + IP ثابت) تلقائياً عند إنشاء العميل،
              وستجد سكريبت MikroTik جاهز للتحميل من لوحة تحكم العميل بعد الإنشاء.
            </div>
            {createMutation.isError && (
              <p className="text-xs text-destructive">
                {(createMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {(isSubmitting || createMutation.isPending) ? 'جاري الحفظ...' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm Dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" /> أرشفة العميل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              سيتم أرشفة العميل <strong className="text-foreground">{archiveTarget?.name}</strong>،
              وقطع اتصاله الحالي من MikroTik مباشرة (بدون إيقاف خدمة SSTP) ومنعه من إعادة الاتصال.
            </p>
            <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded p-2">
              البيانات لن تُحذف — يمكنك استعادة العميل لاحقاً من قائمة "عرض المؤرشف".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>إلغاء</Button>
            <Button
              className="gap-1.5"
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
            >
              <Archive className="h-4 w-4" />
              {archiveMutation.isPending ? 'جاري الأرشفة...' : 'أرشفة وفصل الاتصال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirm Dialog */}
      <Dialog open={!!permanentTarget} onOpenChange={() => setPermanentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> حذف نهائي
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيُحذف العميل <strong className="text-foreground">{permanentTarget?.name}</strong> وجميع
            بياناته نهائياً من قاعدة البيانات. <span className="text-destructive font-bold">لا يمكن التراجع.</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => permanentTarget && permanentMutation.mutate(permanentTarget.id)}
              disabled={permanentMutation.isPending}
            >
              {permanentMutation.isPending ? 'جاري الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
