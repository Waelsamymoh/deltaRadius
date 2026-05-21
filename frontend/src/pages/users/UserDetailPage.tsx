import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowRight, User, Wifi, Calendar, Clock, Download, Upload,
  Smartphone, MapPin, FileText, Activity, Server, LogOut, Loader2, Gift,
} from 'lucide-react'
import { usersApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Stats = {
  username: string
  firstName: string
  mobile: string | null
  address: string | null
  notes: string | null
  startDate: string
  durationDays: number
  expiresAt: string
  remainingDays: number
  plan: { id: number; name: string; downloadMbps: number | null; uploadMbps: number | null } | null
  usage: {
    totalDownloadBytes: number
    totalUploadBytes: number
    totalLimitBytes: number | null
    downloadLimitBytes: number | null
    uploadLimitBytes: number | null
    isTotalQuota: boolean
    remainingBytes: number | null
    remainingDownloadBytes: number | null
    remainingUploadBytes: number | null
  }
  bonus: {
    totalBytes: number
    usedBytes: number
    remainingBytes: number
  }
  activeSession: {
    ip: string
    nasIp: string
    startTime: string
    sessionTime: number
    uploadBytes: number
    downloadBytes: number
  } | null
  sessions: {
    startTime: string
    stopTime: string | null
    ip: string
    nasIp: string
    uploadBytes: number
    downloadBytes: number
    durationSec: number
    terminateCause: string | null
  }[]
}

const fmtBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const fmtDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}س ${m}د`
  if (m > 0) return `${m}د ${s}ث`
  return `${s}ث`
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'

function UsageBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  // Show warning/danger colors when nearing/at limit (overrides base color)
  const visualColor = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-yellow-500' : color
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${visualColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function UserDetailPage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [kickMsg, setKickMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const kickMutation = useMutation({
    mutationFn: () => usersApi.kick(username!),
    onSuccess: (res) => {
      setKickMsg({ ok: res.data.kicked, text: res.data.message })
      if (res.data.kicked) qc.invalidateQueries({ queryKey: ['user-stats', username] })
      setTimeout(() => setKickMsg(null), 4000)
    },
    onError: () => setKickMsg({ ok: false, text: 'حدث خطأ أثناء الطرد' }),
  })

  const { data: stats, isLoading, error } = useQuery<Stats>({
    queryKey: ['user-stats', username],
    queryFn: () => usersApi.stats(username!).then(r => r.data),
    refetchInterval: 5_000,
  })

  if (isLoading) return (
    <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
  )
  if (error || !stats) return (
    <div className="p-8 text-center text-destructive">تعذّر تحميل البيانات</div>
  )

  const daysColor = stats.remainingDays <= 0
    ? 'text-destructive'
    : stats.remainingDays <= 7
    ? 'text-yellow-600'
    : 'text-green-600'

  return (
    <div className="p-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')} className="gap-1">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6" />
            {stats.firstName}
            <span className="font-mono text-base text-muted-foreground" dir="ltr">({stats.username})</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {stats.activeSession ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                متصل الآن — {stats.activeSession.ip}
              </Badge>
            ) : (
              <Badge variant="secondary">غير متصل</Badge>
            )}
            {stats.activeSession && (
              <Button
                size="sm" variant="outline"
                className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                disabled={kickMutation.isPending}
                onClick={() => kickMutation.mutate()}
              >
                {kickMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <LogOut className="h-3 w-3" />}
                طرد من الشبكة
              </Button>
            )}
            {kickMsg && (
              <span className={`text-xs font-medium ${kickMsg.ok ? 'text-green-600' : 'text-orange-600'}`}>
                {kickMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Quick stats */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">الأيام المتبقية</p>
                <p className={`text-3xl font-bold ${daysColor}`}>{Math.max(0, stats.remainingDays)}</p>
                <p className="text-xs text-muted-foreground">ينتهي {stats.expiresAt}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  {stats.usage.isTotalQuota ? 'الكمية المتبقية (إجمالي)' : 'الكمية المتبقية (تحميل)'}
                </p>
                {(stats.usage.isTotalQuota ? stats.usage.remainingBytes : stats.usage.remainingDownloadBytes) !== null ? (
                  <>
                    {(() => {
                      const remaining = stats.usage.isTotalQuota ? stats.usage.remainingBytes! : stats.usage.remainingDownloadBytes!
                      const total = stats.usage.isTotalQuota ? stats.usage.totalLimitBytes! : stats.usage.downloadLimitBytes!
                      const exhausted = remaining === 0
                      const warning = remaining > 0 && remaining / total < 0.2
                      return <>
                        <p className={`text-3xl font-bold ${exhausted ? 'text-destructive' : warning ? 'text-yellow-600' : 'text-primary'}`}>
                          {fmtBytes(remaining)}
                        </p>
                        <p className="text-xs text-muted-foreground">من {fmtBytes(total)}</p>
                      </>
                    })()}
                  </>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">غير محدود</p>
                )}
              </div>
              <Download className="h-8 w-8 text-muted-foreground/40" />
            </div>
            {(stats.usage.isTotalQuota ? stats.usage.totalLimitBytes : stats.usage.downloadLimitBytes) && (
              <div className="mt-2">
                <UsageBar
                  used={stats.usage.isTotalQuota ? (stats.usage.totalDownloadBytes + stats.usage.totalUploadBytes) : stats.usage.totalDownloadBytes}
                  total={stats.usage.isTotalQuota ? stats.usage.totalLimitBytes! : stats.usage.downloadLimitBytes!}
                  color="bg-blue-500"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">الكمية المتبقية (رفع)</p>
                {stats.usage.remainingUploadBytes !== null ? (
                  <>
                    <p className="text-3xl font-bold text-primary">
                      {fmtBytes(stats.usage.remainingUploadBytes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      من {fmtBytes(stats.usage.uploadLimitBytes!)}
                    </p>
                  </>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">غير محدود</p>
                )}
              </div>
              <Upload className="h-8 w-8 text-muted-foreground/40" />
            </div>
            {stats.usage.uploadLimitBytes && (
              <div className="mt-2">
                <UsageBar
                  used={stats.usage.totalUploadBytes}
                  total={stats.usage.uploadLimitBytes}
                  color="bg-orange-500"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bonus / Topup quota */}
        <Card className={stats.bonus.totalBytes > 0 ? 'border-purple-300 bg-purple-50/30 dark:bg-purple-950/10' : ''}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">الباقات الإضافية المتبقية</p>
                {stats.bonus.totalBytes > 0 ? (
                  <>
                    <p className={`text-3xl font-bold ${stats.bonus.remainingBytes === 0 ? 'text-destructive' : 'text-purple-600'}`}>
                      {fmtBytes(stats.bonus.remainingBytes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      من {fmtBytes(stats.bonus.totalBytes)}
                    </p>
                  </>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">لا يوجد</p>
                )}
              </div>
              <Gift className="h-8 w-8 text-purple-400/40" />
            </div>
            {stats.bonus.totalBytes > 0 && (
              <div className="mt-2">
                <UsageBar
                  used={stats.bonus.usedBytes}
                  total={stats.bonus.totalBytes}
                  color="bg-purple-500"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* User info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> بيانات المشترك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row icon={<Smartphone className="h-4 w-4" />} label="الموبايل" value={stats.mobile ?? '—'} />
            <Row icon={<MapPin className="h-4 w-4" />}    label="العنوان"  value={stats.address ?? '—'} />
            <Row icon={<FileText className="h-4 w-4" />}  label="ملاحظات" value={stats.notes ?? '—'} />
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4" /> تفاصيل الاشتراك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row icon={<Activity className="h-4 w-4" />} label="الخطة"
              value={stats.plan
                ? `${stats.plan.name}${stats.plan.downloadMbps ? ` — ${stats.plan.downloadMbps}M` : ''}`
                : '—'} />
            <Row icon={<Calendar className="h-4 w-4" />} label="البداية"  value={stats.startDate} />
            <Row icon={<Clock className="h-4 w-4" />}    label="المدة"    value={`${stats.durationDays} يوم`} />
            <Row icon={<Calendar className="h-4 w-4" />} label="الانتهاء" value={stats.expiresAt}
              className={stats.remainingDays <= 0 ? 'text-destructive font-medium' : ''} />
          </CardContent>
        </Card>

        {/* Active session */}
        {stats.activeSession && (
          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                الجلسة النشطة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row icon={<Wifi className="h-4 w-4" />}     label="IP العميل"  value={stats.activeSession.ip ?? '—'} mono />
              <Row icon={<Server className="h-4 w-4" />}   label="IP الـ NAS" value={stats.activeSession.nasIp} mono />
              <Row icon={<Clock className="h-4 w-4" />}    label="مدة الجلسة" value={fmtDuration(stats.activeSession.sessionTime)} />
              <Row icon={<Calendar className="h-4 w-4" />} label="بدأت"       value={fmtDate(stats.activeSession.startTime)} />
              <Row icon={<Download className="h-4 w-4" />} label="تحميل الجلسة" value={fmtBytes(stats.activeSession.downloadBytes)} />
              <Row icon={<Upload className="h-4 w-4" />}   label="رفع الجلسة"   value={fmtBytes(stats.activeSession.uploadBytes)} />
            </CardContent>
          </Card>
        )}

        {/* Remaining quota breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> المتبقي من الكوته
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              icon={<Download className="h-4 w-4" />}
              label="متبقي للتحميل"
              value={
                stats.usage.isTotalQuota && stats.usage.remainingBytes !== null
                  ? `${fmtBytes(stats.usage.remainingBytes)} (إجمالي مشترك)`
                  : stats.usage.remainingDownloadBytes !== null
                    ? fmtBytes(stats.usage.remainingDownloadBytes)
                    : 'غير محدود'
              }
            />
            <Row
              icon={<Upload className="h-4 w-4" />}
              label="متبقي للرفع"
              value={
                stats.usage.isTotalQuota && stats.usage.remainingBytes !== null
                  ? `${fmtBytes(stats.usage.remainingBytes)} (إجمالي مشترك)`
                  : stats.usage.remainingUploadBytes !== null
                    ? fmtBytes(stats.usage.remainingUploadBytes)
                    : 'غير محدود'
              }
            />
            <Row
              icon={<Download className="h-4 w-4 opacity-50" />}
              label="استُهلك تحميل"
              value={fmtBytes(stats.usage.totalDownloadBytes)}
            />
            <Row
              icon={<Upload className="h-4 w-4 opacity-50" />}
              label="استُهلك رفع"
              value={fmtBytes(stats.usage.totalUploadBytes)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sessions table */}
      {stats.sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> آخر الجلسات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">البداية</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">النهاية</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">IP</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">المدة</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">تحميل</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">رفع</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sessions.map((s, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 px-2">{fmtDate(s.startTime)}</td>
                      <td className="py-1.5 px-2">{s.stopTime ? fmtDate(s.stopTime) : <span className="text-green-600 font-medium">نشطة</span>}</td>
                      <td className="py-1.5 px-2 font-mono">{s.ip ?? '—'}</td>
                      <td className="py-1.5 px-2">{s.durationSec ? fmtDuration(s.durationSec) : '—'}</td>
                      <td className="py-1.5 px-2">{fmtBytes(s.downloadBytes)}</td>
                      <td className="py-1.5 px-2">{fmtBytes(s.uploadBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ icon, label, value, mono, className }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean; className?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`font-medium ${mono ? 'font-mono' : ''} ${className ?? ''}`}>{value}</span>
    </div>
  )
}
