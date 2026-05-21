import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Server, Radio, WifiOff, Loader2, Users, AlertCircle, Copy, Check, ShieldCheck, Download, Terminal } from 'lucide-react'
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

// Create schema — SSTP username/password are auto-generated server-side
const createSchema = z.object({
  shortname: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
})
type CreateFormData = z.infer<typeof createSchema>

type CreatedNas = {
  id: number
  nasname: string
  shortname: string | null
  sstpUsername: string
  sstpPassword: string
  sstpIp: string
}

// Edit schema — only display fields, IP/credentials are locked after creation
const editSchema = z.object({
  shortname: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
})
type EditFormData = z.infer<typeof editSchema>

type Nas = {
  id: number
  nasname: string
  shortname: string | null
  secret: string
  type: string | null
  description: string | null
  sstpUsername: string | null
  sstpIp: string | null
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
  const [createdNas, setCreatedNas] = useState<CreatedNas | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [fetchInfo, setFetchInfo] = useState<{ nas: Nas; url: string; command: string; script: string } | null>(null)
  const [fetchLoading, setFetchLoading] = useState(false)

  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value)
    setCopiedField(label)
    setTimeout(() => setCopiedField(c => (c === label ? null : c)), 1500)
  }

  const openFetch = async (n: Nas) => {
    setFetchLoading(true)
    try {
      const res = await nasApi.fetchCommand(n.id)
      setFetchInfo({
        nas: n,
        url: res.data.url,
        command: res.data.command,
        script: res.data.script,
      })
    } finally {
      setFetchLoading(false)
    }
  }

  const downloadScript = async (n: Nas) => {
    const res = await nasApi.downloadMikrotikScript(n.id)
    const blob: Blob = res.data
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = (n.shortname || n.nasname || `nas-${n.id}`).replace(/[^a-z0-9._-]/gi, '-')
    a.download = `mikrotik-${slug}.rsc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const { data: nasList = [], isLoading } = useQuery<Nas[]>({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then(r => r.data),
  })

  const createForm = useForm<CreateFormData>({ resolver: zodResolver(createSchema) })
  const editForm   = useForm<EditFormData>  ({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateFormData) => nasApi.create(data).then(r => r.data as CreatedNas),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['nas'] })
      closeDialog()
      setCreatedNas(data)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      setFormError(typeof msg === 'string' ? msg : 'حدث خطأ')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditFormData }) => nasApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nas'] }); closeDialog() },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      setFormError(typeof msg === 'string' ? msg : 'حدث خطأ')
    },
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
    createForm.reset({ shortname: '', type: 'mikrotik', description: '' })
    setFormError(null)
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (n: Nas) => {
    editForm.reset({
      shortname: n.shortname ?? '',
      type: n.type ?? 'mikrotik',
      description: n.description ?? '',
    })
    setEditingId(n.id)
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setEditingId(null)
    createForm.reset()
    editForm.reset()
    setFormError(null)
  }

  const onCreateSubmit = (data: CreateFormData) => createMutation.mutate(data)
  const onEditSubmit = (data: EditFormData) => {
    if (editingId !== null) updateMutation.mutate({ id: editingId, data })
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
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">IP الثابت</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم المختصر</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم مستخدم SSTP</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">كلمة المرور</th>
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
                        <td className="py-2 px-3 font-medium font-mono text-primary">{n.nasname}</td>
                        <td className="py-2 px-3 text-muted-foreground">{n.shortname ?? '—'}</td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {n.sstpUsername ? (
                            <div className="flex items-center gap-1.5">
                              <span>{n.sstpUsername}</span>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                title="نسخ"
                                onClick={() => copy(`u-${n.id}`, n.sstpUsername!)}
                              >
                                {copiedField === `u-${n.id}`
                                  ? <Check className="h-3 w-3 text-green-600" />
                                  : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {n.secret ? (
                            <div className="flex items-center gap-1.5">
                              <span>{n.secret}</span>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                title="نسخ"
                                onClick={() => copy(`p-${n.id}`, n.secret)}
                              >
                                {copiedField === `p-${n.id}`
                                  ? <Check className="h-3 w-3 text-green-600" />
                                  : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
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
                        <td className="py-2 px-3 text-left whitespace-nowrap">
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
                          {n.sstpUsername && (
                            <>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 mr-1 text-green-600 hover:text-green-700"
                                title="أمر fetch للمايكروتك"
                                onClick={() => openFetch(n)}
                                disabled={fetchLoading}
                              >
                                <Terminal className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 mr-1 text-blue-600 hover:text-blue-700"
                                title="تحميل سكريبت MikroTik"
                                onClick={() => downloadScript(n)}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
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
            <DialogTitle>{editingId !== null ? 'تعديل جهاز NAS' : 'إضافة جهاز NAS جديد'}</DialogTitle>
          </DialogHeader>

          {editingId === null ? (
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
              {formError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                سيتم توليد اسم مستخدم SSTP وكلمة مرور عشوائياً، وتخصيص IP ثابت تلقائياً.
                ستظهر البيانات لك بعد الإنشاء.
              </div>
              <div className="space-y-1">
                <Label>الاسم المختصر <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                <Input {...createForm.register('shortname')} placeholder="router-01" />
              </div>
              <div className="space-y-1">
                <Label>نوع الجهاز</Label>
                <Select {...createForm.register('type')}>
                  <option value="mikrotik">MikroTik</option>
                  <option value="other">أخرى (other)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>الوصف <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                <Input {...createForm.register('description')} placeholder="وصف الجهاز" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الجهاز'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              {formError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                الـ IP وبيانات SSTP مقفولة بعد إنشاء الجهاز — يمكنك تعديل البيانات الوصفية فقط.
              </div>
              <div className="space-y-1">
                <Label>الاسم المختصر</Label>
                <Input {...editForm.register('shortname')} placeholder="router-01" />
              </div>
              <div className="space-y-1">
                <Label>نوع الجهاز</Label>
                <Select {...editForm.register('type')}>
                  <option value="mikrotik">MikroTik</option>
                  <option value="other">أخرى (other)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>الوصف</Label>
                <Input {...editForm.register('description')} placeholder="وصف الجهاز" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Generated SSTP credentials — shown once after creation */}
      <Dialog open={!!createdNas} onOpenChange={(o) => !o && setCreatedNas(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              تم إنشاء الجهاز — بيانات SSTP
            </DialogTitle>
          </DialogHeader>
          {createdNas && (
            <div className="space-y-3">
              {[
                { label: 'اسم المستخدم', value: createdNas.sstpUsername, key: 'username' },
                { label: 'كلمة المرور',  value: createdNas.sstpPassword, key: 'password' },
                { label: 'الـ IP الثابت', value: createdNas.sstpIp,       key: 'ip' },
              ].map(({ label, value, key }) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <div className="flex gap-2">
                    <Input value={value} readOnly dir="ltr" className="font-mono bg-muted/40" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => copy(key, value)}
                      title="نسخ"
                    >
                      {copiedField === key
                        ? <Check className="h-4 w-4 text-green-600" />
                        : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">
                استخدم هذه البيانات لضبط اتصال SSTP على الراوتر. الـ IP يُعرَّف تلقائياً
                في جدول NAS هنا، وستظهر الجلسة بعد أول اتصال.
              </p>
            </div>
          )}
          <DialogFooter>
            {createdNas && (
              <Button
                variant="outline"
                onClick={() => downloadScript({
                  id: createdNas.id,
                  nasname: createdNas.nasname,
                  shortname: createdNas.shortname,
                  secret: createdNas.sstpPassword,
                  type: null,
                  description: null,
                  sstpUsername: createdNas.sstpUsername,
                  sstpIp: createdNas.sstpIp,
                })}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" /> تحميل سكريبت MikroTik
              </Button>
            )}
            <Button onClick={() => setCreatedNas(null)}>تم — أغلق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fetch-command Dialog — paste-into-MikroTik one-liner */}
      <Dialog open={!!fetchInfo} onOpenChange={(o) => !o && setFetchInfo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-green-600" />
              أمر fetch للمايكروتك — {fetchInfo?.nas.shortname ?? fetchInfo?.nas.nasname}
            </DialogTitle>
          </DialogHeader>
          {fetchInfo && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                انسخ السطر التالي والصقه في طرفية MikroTik — سيقوم بتحميل السكريبت من السيرفر
                وتنفيذه فوراً ثم حذف الملف المؤقت.
              </div>
              <div className="space-y-1">
                <Label>الأمر الجاهز للنسخ</Label>
                <div className="flex gap-2 items-start">
                  <textarea
                    readOnly
                    value={fetchInfo.command}
                    dir="ltr"
                    className="flex-1 min-h-[110px] resize-none rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap break-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copy('fetch-cmd', fetchInfo.command)}
                    title="نسخ الأمر"
                  >
                    {copiedField === 'fetch-cmd'
                      ? <Check className="h-4 w-4 text-green-600" />
                      : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>كود السكريبت (للصق اليدوي)</Label>
                <div className="flex gap-2 items-start">
                  <textarea
                    readOnly
                    value={fetchInfo.script}
                    dir="ltr"
                    className="flex-1 min-h-[140px] resize-none rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap break-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copy('fetch-script', fetchInfo.script)}
                    title="نسخ الكود"
                  >
                    {copiedField === 'fetch-script'
                      ? <Check className="h-4 w-4 text-green-600" />
                      : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  الكود نفسه (بدون تحميل من السيرفر) — يمكنك لصقه مباشرة في طرفية MikroTik.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setFetchInfo(null)}>إغلاق</Button>
          </DialogFooter>
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
