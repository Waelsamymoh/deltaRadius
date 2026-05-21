import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Wifi, ShieldCheck, Trash2, Calendar, Eraser, Loader2 } from 'lucide-react'
import { accountingApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

type Session = {
  id: number
  username: string
  nasIpAddress: string
  framedIpAddress: string
  acctStartTime: string
  acctStopTime: string | null
  acctSessionTime: number | null
  acctInputOctets: number | null
  acctOutputOctets: number | null
}

type AuthLog = {
  id: number
  username: string
  nasIpAddress: string
  reply: string
  authDate: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'

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

  const cleanupMutation = useMutation({
    mutationFn: () => accountingApi.cleanupStaleSessions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions-active'] }),
  })

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    return `${names[mo - 1]} ${y}`
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-7 w-7" /> المحاسبة والسجلات
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
            {loadingActive ? (
              <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            ) : activeSessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد جلسات نشطة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">المستخدم</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">IP الجهاز</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">IP المُسند</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">بدأت</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">المدة</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">تنزيل</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">رفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSessions.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">{s.username}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{s.nasIpAddress}</td>
                        <td className="py-2 px-3 font-mono">{s.framedIpAddress || '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {s.acctStartTime ? new Date(s.acctStartTime).toLocaleString('ar-EG') : '—'}
                        </td>
                        <td className="py-2 px-3">{formatDuration(s.acctSessionTime)}</td>
                        <td className="py-2 px-3 text-blue-600">{formatBytes(s.acctInputOctets)}</td>
                        <td className="py-2 px-3 text-green-600">{formatBytes(s.acctOutputOctets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">المستخدم</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">NAS IP</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">النتيجة</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authLogs.map((l) => (
                      <tr key={l.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">{l.username}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{l.nasIpAddress}</td>
                        <td className="py-2 px-3">
                          <Badge variant={l.reply === 'Access-Accept' ? 'success' : 'destructive'}>
                            {l.reply === 'Access-Accept' ? 'قُبل' : 'رُفض'}
                          </Badge>
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
    </div>
  )
}
