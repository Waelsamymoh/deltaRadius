import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Router as ModemIcon, Globe, Cpu, Hash, StickyNote, Download, CheckSquare, Square, AlertCircle, RotateCcw, BarChart3, Database, Wifi, WifiOff, Calendar, TrendingUp, X, ChevronDown, Server, Power } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { modemsApi, nasApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const schema = z.object({
  name: z.string().min(1, 'مطلوب'),
  model: z.string().optional(),
  macAddress: z.string().optional(),
  serialNumber: z.string().optional(),
  ipAddress: z.string().optional(),
  status: z.enum(['active', 'disabled']),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

type Modem = {
  id: number
  name: string
  model: string | null
  macAddress: string | null
  serialNumber: string | null
  ipAddress: string | null
  status: 'active' | 'disabled'
  notes: string | null
  nasId?: number | null
  totalGb?: number | null
  online?: boolean
}

export default function ModemsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Modem | null>(null)
  const [view, setView] = useState<'list' | 'reports'>('list')

  // MikroTik import state
  const [mkOpen, setMkOpen] = useState(false)
  const [mkSelectedNas, setMkSelectedNas] = useState<any | null>(null)
  const [mkAddresses, setMkAddresses] = useState<any[]>([])
  const [mkSelected, setMkSelected] = useState<Set<number>>(new Set())
  const [mkStep, setMkStep] = useState<'pick' | 'select'>('pick')

  const [searchParams] = useSearchParams()
  const tenantFilter = searchParams.get('tenant') ? Number(searchParams.get('tenant')) : null

  const { data: modems = [], isLoading } = useQuery<Modem[]>({
    queryKey: ['modems', { tenant: tenantFilter }],
    queryFn: () => modemsApi.live(tenantFilter).then(r => r.data),
    refetchInterval: 30_000,       // تحديث تلقائي للحالة والجيجات كل 30 ثانية
    refetchOnWindowFocus: true,
  })

  // NAS devices — used for grouping modems by network + auto-filling credentials
  const { data: nasAll = [] } = useQuery<any[]>({
    queryKey: ['nas', { tenant: tenantFilter }],
    queryFn: () => nasApi.list(tenantFilter).then(r => r.data),
  })
  const routerNasList = nasAll.filter((n: any) => n.type === 'router')
  const nasNameById = (id: number | null | undefined) => {
    const n = nasAll.find((x: any) => x.id === id)
    return n ? (n.shortname || n.nasname) : 'بدون شبكة'
  }

  // Which network groups are expanded (collapsed by default)
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set())
  const toggleGroup = (key: number) =>
    setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => modemsApi.create(data, tenantFilter),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modems'] }); closeDialog() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => modemsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modems'] }); closeDialog() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => modemsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modems'] }); setDeleteTarget(null) },
  })

  const modemsKey = ['modems', { tenant: tenantFilter }] as const
  const setEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => modemsApi.setEnabled(id, enabled, tenantFilter),
    // Optimistic: flip the status in the cache instantly; reconcile via the 30s poll.
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: modemsKey })
      const prev = qc.getQueryData<Modem[]>(modemsKey)
      qc.setQueryData<Modem[]>(modemsKey, old => old?.map(m => m.id === id ? { ...m, status: enabled ? 'active' : 'disabled' } : m))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(modemsKey, ctx.prev) },
  })

  // Bulk enable/disable selected modems (optimistic + parallel).
  const bulkSetEnabled = async (ids: number[], enabled: boolean) => {
    if (!ids.length) return
    qc.setQueryData<Modem[]>(modemsKey, old => old?.map(m => ids.includes(m.id) ? { ...m, status: enabled ? 'active' : 'disabled' } : m))
    await Promise.allSettled(ids.map(id => modemsApi.setEnabled(id, enabled, tenantFilter)))
  }

  const resetMutation = useMutation({
    mutationFn: (ids: number[]) => modemsApi.resetCounters(ids, tenantFilter),
    onSuccess: (res) => {
      // give MikroTik a moment, then refetch live stats so GB shows ~0
      setTimeout(() => qc.invalidateQueries({ queryKey: ['modems'] }), 1500)
      setSelected(new Set())
      alert(`تم تصفير استهلاك ${res.data.reset} راوتر`)
    },
  })

  const mkSyncMutation = useMutation({
    mutationFn: (nas: any) =>
      modemsApi.mikrotikSync(nas.nasname, nas.sstpUsername ?? '', nas.secret ?? '', tenantFilter),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['modems'] })
      alert(`تمت المزامنة — تم تحديث ${res.data.updated} راوتر`)
      closeMkDialog()
    },
  })

  const mkFetchMutation = useMutation({
    mutationFn: (nas: any) =>
      modemsApi.mikrotikFetch(nas.nasname, nas.sstpUsername ?? '', nas.secret ?? ''),
    onSuccess: (res, nas) => {
      setMkSelectedNas(nas)
      setMkAddresses(res.data)
      setMkSelected(new Set(res.data.map((_: any, i: number) => i)))
      setMkStep('select')
    },
  })

  const mkImportMutation = useMutation({
    mutationFn: () => {
      const entries = mkAddresses.filter((_: any, i: number) => mkSelected.has(i))
      return modemsApi.mikrotikImport(
        mkSelectedNas.nasname, mkSelectedNas.sstpUsername ?? '', mkSelectedNas.secret ?? '',
        entries, tenantFilter, mkSelectedNas.id,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modems'] })
      closeMkDialog()
    },
  })

  const toggleMkRow = (i: number) => {
    setMkSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  // ── Row selection ─────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggleOne = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleManyIds = (ids: number[], on: boolean) =>
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n })

  const closeMkDialog = () => {
    setMkOpen(false); setMkStep('pick')
    setMkSelectedNas(null); setMkAddresses([]); setMkSelected(new Set())
    mkFetchMutation.reset(); mkImportMutation.reset()
  }

  const openCreate = () => {
    reset({ name: '', model: '', macAddress: '', serialNumber: '', ipAddress: '', status: 'active', notes: '' })
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (m: Modem) => {
    reset({
      name: m.name,
      model: m.model ?? '',
      macAddress: m.macAddress ?? '',
      serialNumber: m.serialNumber ?? '',
      ipAddress: m.ipAddress ?? '',
      status: m.status ?? 'active',
      notes: m.notes ?? '',
    })
    setEditingId(m.id)
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); setEditingId(null); reset() }

  const onSubmit = (data: FormData) => {
    if (editingId !== null) updateMutation.mutate({ id: editingId, data })
    else createMutation.mutate(data)
  }

  // Totals (live)
  const totalGb = modems.reduce((s, m) => s + (m.totalGb ?? 0), 0)
  const activeCount = modems.filter(m => m.status === 'active').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ModemIcon className="h-7 w-7 text-primary" />
            موديمات المشتركين
          </h1>
          <p className="text-muted-foreground mt-1">إدارة موديمات المشتركين الخاصة بك</p>
          {modems.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 text-sm bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 px-3 py-1.5 rounded-lg font-semibold">
                إجمالي الاستهلاك: {totalGb.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm bg-white/5 text-muted-foreground border border-white/10 px-3 py-1.5 rounded-lg">
                {activeCount} فعّال / {modems.length} إجمالي
              </span>
            </div>
          )}
          {tenantFilter && (
            <Link
              to={`/tenants/${tenantFilter}`}
              className="inline-flex items-center gap-1.5 mt-2 text-xs bg-primary/15 text-primary border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
            >
              العودة للوحة العميل
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMkOpen(true)} className="gap-2">
            <Download className="h-4 w-4" /> استيراد من MikroTik
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> موديم جديد
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/8">
        <button
          onClick={() => setView('list')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${view === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-white/80'}`}
        >
          القائمة
        </button>
        <button
          onClick={() => setView('reports')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${view === 'reports' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-white/80'}`}
        >
          <BarChart3 className="h-4 w-4" /> التقارير
        </button>
      </div>

      {view === 'reports' ? (
        <ModemsReports modems={modems} totalGb={totalGb} activeCount={activeCount} tenantFilter={tenantFilter} networks={routerNasList} />
      ) : isLoading ? (
        <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
      ) : modems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ModemIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>لا توجد موديمات بعد. أضف موديماً جديداً أو استورد من MikroTik.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm">
              <span className="font-semibold text-primary">{selected.size} محدد</span>
              <div className="flex gap-2 mr-auto flex-wrap">
                <Button
                  variant="outline" size="sm" className="gap-1.5 text-green-500"
                  onClick={() => { bulkSetEnabled([...selected], true); setSelected(new Set()) }}
                >
                  <Power className="h-3.5 w-3.5" /> تفعيل المحدد ({selected.size})
                </Button>
                <Button
                  variant="outline" size="sm" className="gap-1.5 text-amber-500"
                  onClick={() => { bulkSetEnabled([...selected], false); setSelected(new Set()) }}
                >
                  <Power className="h-3.5 w-3.5" /> تعطيل المحدد ({selected.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={resetMutation.isPending}
                  onClick={() => {
                    if (!confirm(`هل أنت متأكد من تصفير استهلاك ${selected.size} راوتر؟ سيتم تصفير العدّادات في المايكروتك.`)) return
                    resetMutation.mutate([...selected])
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resetMutation.isPending ? 'جاري التصفير...' : `تصفير الاستهلاك (${selected.size})`}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!confirm(`هل أنت متأكد من حذف ${selected.size} راوتر؟`)) return
                    Promise.all([...selected].map(id => modemsApi.remove(id))).then(() => {
                      qc.invalidateQueries({ queryKey: ['modems'] })
                      setSelected(new Set())
                    })
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف المحدد ({selected.size})
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
              </div>
            </div>
          )}

          {/* One collapsible table per network */}
          <div className="space-y-3">
            {(() => {
              const groups = new Map<number, Modem[]>()
              for (const m of modems) {
                const key = m.nasId ?? -1
                const arr = groups.get(key) ?? []
                arr.push(m)
                groups.set(key, arr)
              }
              return [...groups.entries()].map(([key, list]) => {
                const isOpen = openGroups.has(key)
                const gTotal = list.reduce((s, x) => s + (x.totalGb ?? 0), 0)
                const gActive = list.filter(x => x.status === 'active').length
                const ids = list.map(x => x.id)
                const allG = list.length > 0 && list.every(x => selected.has(x.id))
                return (
                  <div key={key} className="border rounded-xl overflow-hidden">
                    {/* Network header (click to expand/collapse) */}
                    <button
                      onClick={() => toggleGroup(key)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-right"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        <Server className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">{nasNameById(key === -1 ? null : key)}</span>
                        <Badge variant="outline" className="shrink-0">{list.length} راوتر</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-green-500">{gActive} فعّال</span>
                        <span className="text-cyan-500 font-mono font-semibold" dir="ltr">
                          {gTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <table className="w-full text-sm border-t">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="py-2.5 px-4 w-10">
                              <input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary"
                                checked={allG} onChange={() => toggleManyIds(ids, !allG)} />
                            </th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">الاسم</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">الموديل / النوع</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">عنوان IP</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">MAC</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">الحالة</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">الاستهلاك (GB)</th>
                            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">ملاحظات</th>
                            <th className="py-2.5 px-4 w-20" />
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(m => (
                            <tr key={m.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${selected.has(m.id) ? 'bg-primary/5' : ''}`}>
                              <td className="py-2.5 px-4">
                                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary"
                                  checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} />
                              </td>
                              <td className="py-2.5 px-4 font-medium">
                                <div className="flex items-center gap-2">
                                  <ModemIcon className="h-4 w-4 text-primary shrink-0" />
                                  {m.name}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground">{m.model || '—'}</td>
                              <td className="py-2.5 px-4 font-mono text-xs" dir="ltr">{m.ipAddress || '—'}</td>
                              <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground" dir="ltr">{m.macAddress || '—'}</td>
                              <td className="py-2.5 px-4">
                                <Badge variant={m.status === 'active' ? 'default' : 'outline'}>
                                  {m.status === 'active' ? 'فعّال' : 'معطّل'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-xs" dir="ltr">
                                {m.totalGb != null
                                  ? <span className="text-cyan-500 font-semibold">{m.totalGb.toLocaleString()} GB</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-muted-foreground max-w-[200px] truncate">{m.notes || '—'}</td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost" size="icon"
                                    className={`h-7 w-7 ${m.status === 'active' ? 'text-green-500 hover:text-destructive' : 'text-muted-foreground hover:text-green-500'}`}
                                    title={m.status === 'active' ? 'تعطيل على المايكروتك' : 'تفعيل على المايكروتك'}
                                    onClick={() => setEnabledMutation.mutate({ id: m.id, enabled: m.status !== 'active' })}
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(m)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? 'تعديل الموديم' : 'إضافة موديم جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم الموديم</Label>
                <Input {...register('name')} placeholder="موديم المشترك أحمد" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>الموديل / النوع</Label>
                <Input {...register('model')} placeholder="TP-Link Archer" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Cpu className="h-3 w-3 text-blue-500" /> عنوان MAC</Label>
                <Input dir="ltr" {...register('macAddress')} placeholder="AA:BB:CC:DD:EE:FF" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Hash className="h-3 w-3 text-purple-500" /> الرقم التسلسلي</Label>
                <Input dir="ltr" {...register('serialNumber')} placeholder="SN-123456" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Globe className="h-3 w-3 text-cyan-500" /> عنوان IP</Label>
                <Input dir="ltr" {...register('ipAddress')} placeholder="192.168.1.1" />
              </div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <Select {...register('status')}>
                  <option value="active">فعّال</option>
                  <option value="disabled">معطّل</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1"><StickyNote className="h-3 w-3 text-orange-500" /> ملاحظات (اختياري)</Label>
              <textarea
                {...register('notes')}
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="أي تفاصيل إضافية عن الموديم"
              />
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

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف موديم <strong>{deleteTarget?.name}</strong>؟
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

      {/* MikroTik Import Dialog */}
      <Dialog open={mkOpen} onOpenChange={o => !o && closeMkDialog()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              استيراد interfaces من MikroTik
            </DialogTitle>
          </DialogHeader>

          {/* Step 1 — pick a NAS */}
          {mkStep === 'pick' && (
            <div className="space-y-4">
              {mkFetchMutation.isError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {(mkFetchMutation.error as any)?.response?.data?.message ?? 'تعذّر الاتصال بالجهاز'}
                </div>
              )}

              {routerNasList.filter((n: any) => n.type === 'router').length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  لا توجد شبكات من نوع <strong>Router</strong> مضافة بعد.
                  <br />أضف شبكة من نوع Router من صفحة الشبكات أولاً.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">اختر الشبكة لجلب الـ interfaces منها:</p>
                  <div className="space-y-2">
                    {routerNasList
                      .filter((n: any) => n.type === 'router')
                      .map((n: any) => (
                        <div key={n.id} className="flex items-center gap-2">
                          {/* Import button */}
                          <button
                            type="button"
                            disabled={mkFetchMutation.isPending || mkSyncMutation.isPending}
                            onClick={() => mkFetchMutation.mutate(n)}
                            className="flex-1 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/3 hover:bg-primary/10 hover:border-primary/30 transition-all text-right disabled:opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                                <ModemIcon className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{n.shortname || n.nasname}</p>
                                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{n.nasname}</p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">استيراد ←</span>
                          </button>
                          {/* Sync button */}
                          <button
                            type="button"
                            disabled={mkFetchMutation.isPending || mkSyncMutation.isPending}
                            onClick={() => mkSyncMutation.mutate(n)}
                            title="مزامنة الحالات مع المايكروتك"
                            className="flex items-center gap-1.5 px-3 py-3 rounded-xl border border-white/10 bg-white/3 hover:bg-green-500/10 hover:border-green-500/30 text-muted-foreground hover:text-green-500 transition-all disabled:opacity-50 text-xs whitespace-nowrap"
                          >
                            {mkSyncMutation.isPending && mkSyncMutation.variables?.id === n.id
                              ? 'جاري...'
                              : '↻ مزامنة'}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeMkDialog}>إلغاء</Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2 — select interfaces */}
          {mkStep === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ModemIcon className="h-4 w-4 text-primary" />
                <span>
                  {mkSelectedNas?.shortname || mkSelectedNas?.nasname}
                  <span className="font-mono text-xs mr-2 text-muted-foreground/60" dir="ltr">
                    {mkSelectedNas?.nasname}
                  </span>
                </span>
                <Badge variant="outline" className="mr-auto">{mkAddresses.length} interface</Badge>
              </div>

              <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="w-8 py-2 px-3">
                        <button type="button" onClick={() =>
                          mkSelected.size === mkAddresses.length
                            ? setMkSelected(new Set())
                            : setMkSelected(new Set(mkAddresses.map((_,i)=>i)))
                        }>
                          {mkSelected.size === mkAddresses.length
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-xs">Interface</th>
                      <th className="text-right py-2 px-3 font-medium text-xs">النوع</th>
                      <th className="text-right py-2 px-3 font-medium text-xs">الحالة</th>
                      <th className="text-right py-2 px-3 font-medium text-xs">تعليق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mkAddresses.map((addr, i) => (
                      <tr
                        key={i}
                        onClick={() => toggleMkRow(i)}
                        className={`border-t cursor-pointer hover:bg-muted/30 transition-colors ${mkSelected.has(i) ? 'bg-primary/5' : ''}`}
                      >
                        <td className="py-2 px-3">
                          {mkSelected.has(i)
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs" dir="ltr">{addr.address}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground" dir="ltr">{addr.network}</td>
                        <td className="py-2 px-3 text-xs">
                          <span className={addr.interface === 'true' ? 'text-green-500' : 'text-muted-foreground'}>
                            {addr.interface === 'true' ? 'فعّال' : 'غير فعّال'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{addr.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mkImportMutation.isError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {(mkImportMutation.error as any)?.response?.data?.message ?? 'تعذّر الاستيراد'}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setMkStep('pick'); mkFetchMutation.reset() }}>رجوع</Button>
                <Button variant="outline" onClick={closeMkDialog}>إلغاء</Button>
                <Button
                  disabled={mkSelected.size === 0 || mkImportMutation.isPending}
                  onClick={() => mkImportMutation.mutate()}
                >
                  {mkImportMutation.isPending
                    ? 'جاري الإضافة...'
                    : `إضافة ${mkSelected.size} ${mkSelected.size === 1 ? 'interface' : 'interfaces'}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Reports tab (mirrors the subscriber reports) ────────────────
const fmtBytes = (b: number) => {
  const n = Number(b) || 0
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`
  if (n >= 1024)      return `${(n / 1024).toFixed(2)} KB`
  return `${n} B`
}
const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function ModemsReports({ modems, totalGb, activeCount, tenantFilter, networks }: {
  modems: Modem[]
  totalGb: number
  activeCount: number
  tenantFilter: number | null
  networks: any[]
}) {
  const fmtGb = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [nasId, setNasId] = useState<number | null>(null) // null = كل الشبكات

  // Reports scoped to the selected network (or all). Filter live modems too.
  const scopedModems = nasId == null ? modems : modems.filter(m => m.nasId === nasId)
  const scopedTotalGb = nasId == null ? totalGb : scopedModems.reduce((s, m) => s + (m.totalGb ?? 0), 0)
  const scopedActive = nasId == null ? activeCount : scopedModems.filter(m => m.status === 'active').length

  const yearlyQ = useQuery<{ year: number; bytes: number; gb: number }[]>({
    queryKey: ['modems-yearly', { tenant: tenantFilter, nasId }],
    queryFn: () => modemsApi.reportYearly(5, tenantFilter, nasId).then(r => r.data),
  })
  const monthlyQ = useQuery<{ month: number; bytes: number; gb: number }[]>({
    queryKey: ['modems-monthly', { tenant: tenantFilter, nasId, year: selectedYear }],
    queryFn: () => modemsApi.reportMonthly(selectedYear, tenantFilter, nasId).then(r => r.data),
  })
  const dailyQ = useQuery<{ day: number; bytes: number; gb: number }[]>({
    queryKey: ['modems-daily', { tenant: tenantFilter, nasId, year: selectedYear, month: selectedMonth }],
    queryFn: () => modemsApi.reportDaily(selectedYear, selectedMonth, tenantFilter, nasId).then(r => r.data),
    refetchInterval: 60_000,
  })
  const dayRoutersQ = useQuery<{ name: string; status: string; bytes: number; gb: number }[]>({
    queryKey: ['modems-day-routers', { tenant: tenantFilter, nasId, year: selectedYear, month: selectedMonth, day: selectedDay }],
    queryFn: () => modemsApi.reportDailyRouters(selectedYear, selectedMonth, selectedDay!, tenantFilter, nasId).then(r => r.data),
    enabled: selectedDay !== null,
  })

  // Daily auto-reset toggle (per tenant)
  const qcR = useQueryClient()
  const autoResetQ = useQuery({
    queryKey: ['modems-auto-reset', { tenant: tenantFilter }],
    queryFn: () => modemsApi.getAutoReset(tenantFilter).then(r => r.data.enabled as boolean),
  })
  const autoResetM = useMutation({
    mutationFn: (on: boolean) => modemsApi.setAutoReset(on, tenantFilter),
    onSuccess: () => qcR.invalidateQueries({ queryKey: ['modems-auto-reset'] }),
  })
  const autoReset = autoResetQ.data ?? false

  const yearly = yearlyQ.data ?? []
  const monthly = monthlyQ.data ?? []
  const daily = dailyQ.data ?? []

  const yearlyTotal = yearly.reduce((s, r) => s + r.bytes, 0)
  const monthlyTotal = monthly.reduce((s, r) => s + r.bytes, 0)
  const dailyTotal = daily.reduce((s, r) => s + r.bytes, 0)

  const yearlyData = yearly.map(r => ({ label: String(r.year), value: r.gb }))

  // Always show all 12 months — empty/future months stay at 0.
  const monthlyMap = new Map(monthly.map(r => [r.month, r.gb]))
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    label: monthNames[i], value: monthlyMap.get(i + 1) ?? 0,
  }))

  // Always show every day of the selected month — empty/future days stay at 0.
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
  const dailyMap = new Map(daily.map(r => [r.day, r.gb]))
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1, label: String(i + 1), value: dailyMap.get(i + 1) ?? 0,
  }))

  // Live extras (current cumulative) — scoped to selected network
  const ranked = [...scopedModems].map(m => ({ ...m, gb: m.totalGb ?? 0 })).sort((a, b) => b.gb - a.gb)
  const maxGb = ranked[0]?.gb || 1

  return (
    <div className="space-y-6">
      {/* Network selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Server className="h-4 w-4" /> الشبكة:</span>
        <button
          onClick={() => setNasId(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${nasId == null ? 'bg-primary/15 text-primary border-primary/30' : 'bg-white/3 text-muted-foreground border-white/10 hover:text-white/80'}`}
        >
          كل الشبكات
        </button>
        {networks.map((n: any) => (
          <button
            key={n.id}
            onClick={() => setNasId(n.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${nasId === n.id ? 'bg-primary/15 text-primary border-primary/30' : 'bg-white/3 text-muted-foreground border-white/10 hover:text-white/80'}`}
          >
            {n.shortname || n.nasname}
          </button>
        ))}
      </div>

      {/* Auto-reset toggle */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/3 flex-wrap">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-sm font-semibold">تصفير الاستهلاك تلقائياً في بداية كل يوم</p>
            <p className="text-xs text-muted-foreground">عند التفعيل، تُصفَّر عدّادات الرواتر تلقائياً عند منتصف الليل (حسب توقيت النظام)، فيبدأ «الاستهلاك الحالي» من الصفر كل يوم.</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={autoReset}
          disabled={autoResetM.isPending}
          onClick={() => autoResetM.mutate(!autoReset)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${autoReset ? 'bg-amber-500' : 'bg-white/15'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${autoReset ? 'translate-x-[-22px]' : 'translate-x-[-2px]'}`} />
        </button>
      </div>

      {/* Summary cards (live) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/15 flex items-center justify-center"><Database className="h-5 w-5 text-cyan-500" /></div>
          <div><p className="text-xs text-muted-foreground">الاستهلاك الحالي</p><p className="text-xl font-bold text-cyan-500">{fmtGb(scopedTotalGb)} <span className="text-sm">GB</span></p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center"><ModemIcon className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">عدد الرواتر</p><p className="text-xl font-bold">{scopedModems.length}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-green-500/15 flex items-center justify-center"><Wifi className="h-5 w-5 text-green-500" /></div>
          <div><p className="text-xs text-muted-foreground">فعّال</p><p className="text-xl font-bold text-green-500">{scopedActive}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center"><WifiOff className="h-5 w-5 text-muted-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">معطّل</p><p className="text-xl font-bold text-muted-foreground">{scopedModems.length - scopedActive}</p></div>
        </div></CardContent></Card>
      </div>

      {/* Yearly */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> الاستهلاك السنوي</span>
            <span className="text-sm font-normal text-muted-foreground">الإجمالي: <span className="text-emerald-500 font-bold">{fmtBytes(yearlyTotal)}</span></span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {yearlyQ.isLoading ? <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            : yearly.length === 0 ? <p className="text-center text-muted-foreground py-8">لا توجد بيانات بعد</p>
            : (
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#ffffff80' }} />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} tick={{ fontSize: 11, fill: '#ffffff80' }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} contentStyle={{ background: '#1a1a1a', border: '1px solid #ffffff20', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#10b981" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer></div>
            )}
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> الاستهلاك الشهري</span>
            <div className="flex items-center gap-3">
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm">
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm font-normal text-muted-foreground">الإجمالي: <span className="text-emerald-500 font-bold">{fmtBytes(monthlyTotal)}</span></span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyQ.isLoading ? <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            : (
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#ffffff80' }} />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} tick={{ fontSize: 11, fill: '#ffffff80' }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} contentStyle={{ background: '#1a1a1a', border: '1px solid #ffffff20', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer></div>
            )}
        </CardContent>
      </Card>

      {/* Daily */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> الاستهلاك اليومي</span>
            <div className="flex items-center gap-3 flex-wrap">
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm">
                {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm">
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm font-normal text-muted-foreground">الإجمالي: <span className="text-emerald-500 font-bold">{fmtBytes(dailyTotal)}</span></span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyQ.isLoading ? <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            : (
              <div className="h-72"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                  <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: '#ffffff80' }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} tick={{ fontSize: 11, fill: '#ffffff80' }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} labelFormatter={l => `يوم ${l} / ${monthNames[selectedMonth - 1]} ${selectedYear}`} contentStyle={{ background: '#1a1a1a', border: '1px solid #ffffff20', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[6,6,0,0]} cursor="pointer" onClick={(d: any) => d?.day && setSelectedDay(d.day)} />
                </BarChart>
              </ResponsiveContainer></div>
            )}
          <p className="text-center text-xs text-muted-foreground mt-2">💡 اضغط على أي يوم لعرض استهلاك كل راوتر خلاله</p>
        </CardContent>
      </Card>

      {/* Live top consumers (cumulative now) */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-500" /> أكثر الرواتر استهلاكاً (حالياً)</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          {ranked.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>
            : ranked.slice(0, 15).map(m => (
              <div key={m.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`h-2 w-2 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    {m.name}
                  </span>
                  <span className="font-mono text-xs text-cyan-500" dir="ltr">{fmtGb(m.gb)} GB</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${(m.gb / maxGb) * 100}%` }} />
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Routers-of-the-day modal */}
      {selectedDay !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="bg-background rounded-lg border max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><ModemIcon className="h-5 w-5 text-primary" /> رواتر يوم {selectedDay} {monthNames[selectedMonth - 1]} {selectedYear}</h3>
                <p className="text-xs text-muted-foreground mt-1">مرتّبة حسب أكبر استهلاك أولاً</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-muted rounded-md transition"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-4">
              {dayRoutersQ.isLoading ? <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
                : (dayRoutersQ.data ?? []).length === 0 ? <p className="text-center text-muted-foreground py-8">لا يوجد استهلاك لهذا اليوم</p>
                : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium w-10">#</th>
                      <th className="text-right py-2 px-3 font-medium">الراوتر</th>
                      <th className="text-right py-2 px-3 font-medium">الحالة</th>
                      <th className="text-left py-2 px-3 font-medium">الاستهلاك</th>
                    </tr></thead>
                    <tbody>
                      {(dayRoutersQ.data ?? []).map((r, i) => (
                        <tr key={r.name} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="py-2 px-3 font-medium">{r.name}</td>
                          <td className="py-2 px-3"><Badge variant={r.status === 'active' ? 'default' : 'outline'}>{r.status === 'active' ? 'فعّال' : 'معطّل'}</Badge></td>
                          <td className="py-2 px-3 text-left font-bold"><Badge variant="outline">{fmtBytes(r.bytes)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
