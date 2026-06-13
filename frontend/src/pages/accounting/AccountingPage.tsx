import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Wifi, ShieldCheck, Trash2, Calendar, Eraser, Loader2, Clock, Search } from 'lucide-react'
import { accountingApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

type Session = {
  radacctid: number
  username: string
  subscriber_name?: string | null
  network_name?: string | null
  nasipaddress: string
  framedipaddress: string
  acctstarttime: string
  acctstoptime: string | null
  acctsessiontime: number | null
  acctinputoctets: number | null
  acctoutputoctets: number | null
}

type AuthLog = {
  id: number
  username: string
  nasIpAddress: string | null
  networkName: string | null
  subscriberName: string | null
  replyMessage: string | null
  reply: string
  authDate: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}س ${m}د` : m > 0 ? `${m}د ${s}ث` : `${s}ث`
}

export default function AccountingPage() {
  const [tab, setTab] = useState<'sessions' | 'auth'>('sessions')
  const [deleteMonth, setDeleteMonth] = useState<{ month: string; count: number } | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [purgeEnabled, setPurgeEnabled] = useState(false)
  const [purgeDays, setPurgeDays] = useState<number | ''>(30)
  const [purgeUnit, setPurgeUnit] = useState<'days' | 'hours'>('days')
  const [sessionSearch, setSessionSearch] = useState('')
  const qc = useQueryClient()
  const { user } = useAuthStore()
  // SaaS owner OR tenant top admin manages auth-log retention for their scope.
  const isOwner = user?.role === 'owner' || user?.role === 'superadmin' || user?.role === 'admin'

  const { data: activeSessions = [], isLoading: loadingActive } = useQuery<Session[]>({
    queryKey: ['sessions-active'],
    queryFn: () => accountingApi.sessions(true).then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: authLogs = [], isLoading: loadingAuth } = useQuery<AuthLog[]>({
    queryKey: ['auth-logs'],
    queryFn: () => accountingApi.authLogs().then(r => r.data),
    enabled: tab === 'auth',
  })

  const { data: authMonths = [] } = useQuery<{ month: string; count: number }[]>({
    queryKey: ['auth-log-months'],
    queryFn: () => accountingApi.authLogMonths().then(r => r.data),
    enabled: tab === 'auth' && isOwner,
  })

  const deleteMonthMutation = useMutation({
    mutationFn: (month: string) => accountingApi.deleteAuthLogsByMonth(month),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-logs'] })
      qc.invalidateQueries({ queryKey: ['auth-log-months'] })
      setDeleteMonth(null)
    },
  })

  const { data: autoPurge } = useQuery<{ enabled: boolean; days: number | null; unit: 'days' | 'hours'; lastPurgeAt: string | null }>({
    queryKey: ['auth-log-auto-purge'],
    queryFn: () => accountingApi.getAuthLogAutoPurge().then(r => r.data),
    enabled: tab === 'auth' && isOwner,
  })

  // Sync the local form state with the server value whenever the query data
  // resolves so the toggle/input reflect what's actually saved.
  useEffect(() => {
    if (!autoPurge) return
    setPurgeEnabled(!!autoPurge.enabled)
    setPurgeDays(autoPurge.days ?? 30)
    setPurgeUnit(autoPurge.unit ?? 'days')
  }, [autoPurge?.enabled, autoPurge?.days, autoPurge?.unit])

  const deleteAllMutation = useMutation({
    mutationFn: () => accountingApi.deleteAllAuthLogs(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-logs'] })
      qc.invalidateQueries({ queryKey: ['auth-log-months'] })
      qc.invalidateQueries({ queryKey: ['auth-log-auto-purge'] })
      setConfirmDeleteAll(false)
    },
  })

  const setPurgeMutation = useMutation({
    mutationFn: (data: { enabled: boolean; days?: number | null }) => accountingApi.setAuthLogAutoPurge(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-log-auto-purge'] }),
  })

  const cleanupMutation = useMutation({
    mutationFn: () => accountingApi.cleanupStaleSessions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions-active'] }),
  })

  // Match against subscriber name, username (MAC), or any of the IPs.
  // Normalise Arabic-Indic + Persian digits so an IP typed on an Arabic keyboard
  // still matches the Latin digits stored in the DB.
  const normDigits = (s: string) => (s ?? '')
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48))
  const sessionQuery = normDigits(sessionSearch.trim()).toLowerCase()
  const filteredActiveSessions = sessionQuery
    ? activeSessions.filter(s =>
        (s.subscriber_name ?? '').toLowerCase().includes(sessionQuery) ||
        (s.username ?? '').toLowerCase().includes(sessionQuery) ||
        (s.network_name ?? '').toLowerCase().includes(sessionQuery) ||
        normDigits(s.framedipaddress ?? '').includes(sessionQuery))
    : activeSessions

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    return `${names[mo - 1]} ${y}`
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-7 w-7" /> الجلسات وسجلات المصادقة
        </h1>
        <p className="text-muted-foreground mt-1">سجلات الجلسات وأحداث المصادقة</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'sessions' ? 'default' : 'outline'}
          className="gap-2"
          onClick={() => setTab('sessions')}
        >
          <Wifi className="h-4 w-4" />
          الجلسات النشطة
          {activeSessions.length > 0 && (
            <Badge variant={tab === 'sessions' ? 'secondary' : 'outline'} className="ml-1">
              {activeSessions.length}
            </Badge>
          )}
        </Button>
        <Button
          variant={tab === 'auth' ? 'default' : 'outline'}
          className="gap-2"
          onClick={() => setTab('auth')}
        >
          <ShieldCheck className="h-4 w-4" />
          سجلات المصادقة
        </Button>
      </div>

      {/* Sessions Table */}
      {tab === 'sessions' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                الجلسات النشطة حالياً
                <Badge variant="success" className="ml-1">{activeSessions.length} متصل</Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
                title="إغلاق الجلسات المعلّقة (لم يصل لها interim update من 10 دقائق)"
              >
                {cleanupMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eraser className="h-3.5 w-3.5" />}
                تنظيف الجلسات المعلّقة
                {cleanupMutation.data?.data?.closed > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {cleanupMutation.data.data.closed}
                  </Badge>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              الجلسة تُعتبر نشطة فقط إذا وصل منها interim-update خلال آخر 10 دقائق —
              تُستثنى الجلسات المعلّقة (انقطع NAS بدون إرسال Stop)
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3 max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder="بحث بالاسم أو الـ IP..."
                className="pr-9"
              />
            </div>
            {loadingActive ? (
              <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            ) : activeSessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد جلسات نشطة</p>
            ) : filteredActiveSessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد نتائج للبحث</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم العميل</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم الشبكة</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">IP المشترك</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">بدأت</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">المدة</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">تنزيل</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">رفع</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">إجمالي التحميل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveSessions.map((s) => (
                      <tr key={s.radacctid} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3">
                          <span className="font-medium">{s.subscriber_name || s.username}</span>
                          {s.subscriber_name && (
                            <span className="block text-[10px] text-muted-foreground font-mono">{s.username}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{s.network_name || '—'}</td>
                        <td className="py-2 px-3 font-mono">
                          {s.framedipaddress ? (
                            <a
                              href={`http://${s.framedipaddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline underline-offset-2 hover:text-primary/80"
                              title="فتح راوتر المشترك في تبويب جديد"
                            >
                              {s.framedipaddress}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {s.acctstarttime ? new Date(s.acctstarttime).toLocaleString('ar-EG') : '—'}
                        </td>
                        <td className="py-2 px-3">{formatDuration(s.acctsessiontime)}</td>
                        <td className="py-2 px-3 text-blue-600">{formatBytes(Number(s.acctoutputoctets) || 0)}</td>
                        <td className="py-2 px-3 text-green-600">{formatBytes(Number(s.acctinputoctets) || 0)}</td>
                        <td className="py-2 px-3 font-bold">{formatBytes((Number(s.acctoutputoctets) || 0) + (Number(s.acctinputoctets) || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Auth Log Maintenance — owner only */}
      {tab === 'auth' && isOwner && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eraser className="h-4 w-4" /> صيانة سجلات المصادقة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Clear all */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b">
              <div>
                <p className="text-sm font-medium">مسح كل السجلات الآن</p>
                <p className="text-xs text-muted-foreground">بيمسح كل سجلات المصادقة لهذا العميل دفعة واحدة.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setConfirmDeleteAll(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> مسح الكل
              </Button>
            </div>

            {/* Auto-purge */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex-1 min-w-[260px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={purgeEnabled}
                    onChange={e => setPurgeEnabled(e.target.checked)}
                  />
                  <span className="text-sm font-medium">تفعيل المسح التلقائي الدوري</span>
                </label>
                <p className="text-xs text-muted-foreground mt-1 mr-6">
                  بيفرّغ كل السجلات تلقائياً بعد كل فترة محددة (بالأيام أو الساعات).
                </p>
                {autoPurge?.lastPurgeAt && (
                  <p className="text-xs text-muted-foreground mt-1 mr-6 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    آخر مسح تلقائي: {new Date(autoPurge.lastPurgeAt).toLocaleString('ar-EG')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">كل</span>
                <Input
                  type="number"
                  min={1}
                  value={purgeDays}
                  onChange={e => setPurgeDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                  disabled={!purgeEnabled}
                  className="w-20 text-center"
                />
                <select
                  value={purgeUnit}
                  onChange={e => setPurgeUnit(e.target.value as 'days' | 'hours')}
                  disabled={!purgeEnabled}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                >
                  <option value="days">يوم</option>
                  <option value="hours">ساعة</option>
                </select>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={setPurgeMutation.isPending || (purgeEnabled && (!purgeDays || purgeDays < 1))}
                  onClick={() => setPurgeMutation.mutate({
                    enabled: purgeEnabled,
                    days: purgeEnabled ? Number(purgeDays) : null,
                    unit: purgeUnit,
                  })}
                >
                  {setPurgeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  حفظ
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auth Logs Table */}
      {tab === 'auth' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                سجلات المصادقة
              </CardTitle>
              {isOwner && authMonths.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">مسح سجلات شهر:</span>
                  {authMonths.map(m => (
                    <Button
                      key={m.month}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:bg-red-50 dark:hover:bg-red-950 border-destructive/30"
                      onClick={() => setDeleteMonth(m)}
                      title={`حذف ${m.count} سجل`}
                    >
                      <Trash2 className="h-3 w-3" />
                      {monthLabel(m.month)}
                      <span className="text-muted-foreground">({m.count})</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingAuth ? (
              <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            ) : authLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد سجلات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم العميل</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">الشبكة / IP</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">النتيجة</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">السبب</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authLogs.map((l) => (
                      <tr key={l.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3">
                          <span className="font-medium">{l.subscriberName || l.username}</span>
                          {l.subscriberName && (
                            <span className="block text-[10px] text-muted-foreground font-mono">{l.username}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {l.networkName && <span className="font-medium block">{l.networkName}</span>}
                          {l.nasIpAddress && <span className="font-mono text-muted-foreground">{l.nasIpAddress}</span>}
                          {!l.networkName && !l.nasIpAddress && '—'}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant={l.reply === 'Access-Accept' ? 'success' : 'destructive'}>
                            {l.reply === 'Access-Accept' ? 'قُبل' : 'رُفض'}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground max-w-xs">
                          {l.replyMessage || (l.reply === 'Access-Accept' ? '—' : 'رفض عام')}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {l.authDate ? new Date(l.authDate).toLocaleString('ar-EG') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm delete month */}
      <Dialog open={!!deleteMonth} onOpenChange={() => setDeleteMonth(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              مسح سجلات شهر {deleteMonth && monthLabel(deleteMonth.month)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            سيتم حذف <strong>{deleteMonth?.count}</strong> سجل مصادقة نهائياً.
            لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMonth(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMonth && deleteMonthMutation.mutate(deleteMonth.month)}
              disabled={deleteMonthMutation.isPending}
            >
              {deleteMonthMutation.isPending ? 'جاري الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete ALL auth logs */}
      <Dialog open={confirmDeleteAll} onOpenChange={() => setConfirmDeleteAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> مسح كل سجلات المصادقة
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            سيتم حذف <strong>كل</strong> سجلات المصادقة لهذا العميل نهائياً. لا يمكن التراجع.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteAll(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? 'جاري الحذف...' : 'حذف الكل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
