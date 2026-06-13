import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ScrollText, User, Activity, Filter, Trash2, Eraser, Calendar } from 'lucide-react'
import { auditLogsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

type Log = {
  id: number
  adminId: number | null
  adminEmail: string | null
  adminName: string | null
  adminRole: string | null
  method: string | null
  path: string | null
  action: string
  description: string
  entityType: string | null
  entityKey: string | null
  /** Resolved subscriber name when entityType=subscriber; used for highlighting */
  subscriberName?: string | null
  statusCode: number | null
  ipAddress: string | null
  createdAt: string
}

/** Render a description string with the subscriber's name highlighted in a
 *  different color. Falls back to plain text when no name to highlight. */
function HighlightedDesc({ text, name }: { text: string; name?: string | null }) {
  if (!name || !text.includes(name)) return <>{text}</>
  // Split on the FIRST occurrence — the name appears once per log entry.
  const idx = text.indexOf(name)
  const before = text.slice(0, idx)
  const after  = text.slice(idx + name.length)
  return (
    <>
      {before}
      <span className="font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{name}</span>
      {after}
    </>
  )
}

type AdminSummary = {
  adminId: number
  adminEmail: string
  adminName: string | null
  adminRole: string
  count: number
  lastAt: string
}

const roleLabels: Record<string, string> = {
  owner: 'مالك',
  owner_assistant: 'مساعد المالك',
  superadmin: 'مدير',
  admin: 'مشرف عام',
  tenant_assistant: 'مشرف',
  moderator: 'بائع',
}

const methodColors: Record<string, string> = {
  POST:   'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  PATCH:  'bg-blue-100  text-blue-700  dark:bg-blue-950/40  dark:text-blue-300',
  PUT:    'bg-blue-100  text-blue-700  dark:bg-blue-950/40  dark:text-blue-300',
  DELETE: 'bg-red-100   text-red-700   dark:bg-red-950/40   dark:text-red-300',
}

export default function AuditLogsPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'owner'
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const [filterAdmin, setFilterAdmin] = useState<number | ''>('')
  const [actionFilter, setActionFilter] = useState('')
  const [deleteMonth, setDeleteMonth] = useState<{ month: string; count: number } | null>(null)

  const monthsQ = useQuery<{ month: string; count: number }[]>({
    queryKey: ['audit-logs', 'months'],
    queryFn: () => auditLogsApi.months().then(r => r.data),
    enabled: isAdmin,
  })

  const deleteMonthMutation = useMutation({
    mutationFn: (month: string) => auditLogsApi.deleteByMonth(month),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-logs'] })
      setDeleteMonth(null)
    },
  })

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    return `${names[mo - 1]} ${y}`
  }

  const listQ = useQuery<Log[]>({
    queryKey: ['audit-logs', { from, to, filterAdmin, actionFilter }],
    queryFn: () => auditLogsApi.list({
      from: from || undefined,
      to:   to   || undefined,
      adminId: filterAdmin === '' ? undefined : (filterAdmin as number),
      action: actionFilter || undefined,
      limit: 500,
    }).then(r => r.data),
    refetchInterval: 10_000,
  })

  const summaryQ = useQuery<AdminSummary[]>({
    queryKey: ['audit-logs', 'summary', { from, to }],
    queryFn: () => auditLogsApi.summary({ from: from || undefined, to: to || undefined }).then(r => r.data),
    enabled: isAdmin,
  })

  const logs = listQ.data ?? []
  const summary = summaryQ.data ?? []

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScrollText className="h-7 w-7" /> سجل النشاطات
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? 'كل عملية قام بها فريق العمل في الحساب — مع الوقت والمنفّذ'
            : 'كل عملية قمت بها'}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">من تاريخ</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm" />
          </div>
          {isAdmin && summary.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">المنفّذ</label>
              <select
                value={filterAdmin}
                onChange={e => setFilterAdmin(e.target.value === '' ? '' : Number(e.target.value))}
                className="border border-input bg-background rounded-md px-3 py-2 text-sm"
              >
                <option value="">— الكل —</option>
                {summary.map(s => (
                  <option key={s.adminId} value={s.adminId}>
                    {s.adminName || s.adminEmail} ({roleLabels[s.adminRole] ?? s.adminRole})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">نوع العملية</label>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm">
              <option value="">— كل العمليات —</option>
              <option value="subscriber">المشتركين</option>
              <option value="plan">الخطط</option>
              <option value="topup">باقات الكوته</option>
              <option value="card">الكروت</option>
              <option value="nas">أجهزة NAS</option>
              <option value="assistant">المشرفين</option>
              <option value="auth">الدخول</option>
              <option value="settings">الإعدادات</option>
            </select>
          </div>
          <div className="ml-auto text-sm">
            <Badge variant="secondary">{logs.length} عملية</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Per-admin summary — only for tenant admins */}
      {isAdmin && summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> ملخص النشاط حسب المستخدم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.map(s => (
                <div
                  key={s.adminId}
                  className="rounded-md border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition"
                  onClick={() => setFilterAdmin(s.adminId)}
                >
                  <div className="font-bold text-sm">{s.adminName || s.adminEmail}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">{s.adminEmail}</div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="outline">{roleLabels[s.adminRole] ?? s.adminRole}</Badge>
                    <span className="text-lg font-black text-primary">{s.count}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    آخر نشاط: {new Date(s.lastAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Maintenance: per-month delete — admins only, hidden from supervisors */}
      {isAdmin && (monthsQ.data ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eraser className="h-4 w-4" /> صيانة سجل النشاطات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center flex-wrap gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground ml-1">مسح سجلات شهر:</span>
              {(monthsQ.data ?? []).map(m => (
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
          </CardContent>
        </Card>
      )}

      {/* Logs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" /> العمليات (آخر {logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد عمليات ضمن الفترة المحددة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 px-3 font-medium">الوقت</th>
                    <th className="text-right py-2 px-3 font-medium">المنفّذ</th>
                    {isAdmin && <th className="text-right py-2 px-3 font-medium">الدور</th>}
                    <th className="text-right py-2 px-3 font-medium">العملية</th>
                    <th className="text-right py-2 px-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 text-xs font-mono whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium">{l.adminName || l.adminEmail || '—'}</div>
                            {l.adminName && <div className="text-[10px] text-muted-foreground font-mono">{l.adminEmail}</div>}
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-3 text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {roleLabels[l.adminRole ?? ''] ?? l.adminRole ?? '—'}
                          </Badge>
                        </td>
                      )}
                      <td className="py-2 px-3">
                        <div className="flex items-start gap-2">
                          {l.method && (
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${methodColors[l.method] ?? 'bg-muted text-muted-foreground'}`}>
                              {l.method}
                            </span>
                          )}
                          <span><HighlightedDesc text={l.description} name={l.subscriberName} /></span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs">
                        <Badge variant={l.statusCode && l.statusCode >= 400 ? 'destructive' : 'secondary'}>
                          {l.statusCode ?? '—'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
            سيتم حذف <strong>{deleteMonth?.count}</strong> عملية نهائياً من سجل النشاطات. لا يمكن التراجع.
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
