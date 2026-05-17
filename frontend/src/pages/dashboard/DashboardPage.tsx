import { useQuery } from '@tanstack/react-query'
import {
  Users, Server, Wifi, CreditCard, TrendingUp, TrendingDown,
  Activity, BarChart3, RefreshCw,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { accountingApi, nasApi } from '@/api/endpoints'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon: Icon, color = 'text-primary',
}: {
  title: string; value: string | number; sub?: string
  icon: React.ElementType; color?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── card status colors ────────────────────────────────────────────────────────

const CARD_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#6b7280']
const CARD_LABELS = ['غير مستخدم', 'نشط', 'منتهي', 'معطل']

// ── main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: dash, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => accountingApi.dashboard().then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: sessions } = useQuery({
    queryKey: ['sessions-active'],
    queryFn: () => accountingApi.sessions(true).then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: nasList } = useQuery({
    queryKey: ['nas'],
    queryFn: () => nasApi.list().then(r => r.data),
  })

  const cardPieData = dash ? [
    { name: 'غير مستخدم', value: dash.cards.unused },
    { name: 'نشط',        value: dash.cards.active },
    { name: 'منتهي',      value: dash.cards.expired },
    { name: 'معطل',       value: dash.cards.disabled },
  ] : []

  const dailyChart = (dash?.dailyData ?? []).map((d: { day: string; sessions: number; uploadBytes: number; downloadBytes: number }) => ({
    day:      fmtDay(d.day),
    جلسات:    d.sessions,
    تحميل:    +(d.downloadBytes / 1024 / 1024 / 1024).toFixed(2),
    رفع:      +(d.uploadBytes   / 1024 / 1024 / 1024).toFixed(2),
  }))

  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">لوحة التحكم</h1>
          <p className="text-muted-foreground text-sm mt-1">نظرة عامة على النظام</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ml-1 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {/* top stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="الجلسات النشطة"
          value={isLoading ? '...' : (dash?.activeSessions ?? 0)}
          sub={`إجمالي الجلسات: ${dash?.totalSessions ?? 0}`}
          icon={Wifi}
          color="text-green-500"
        />
        <StatCard
          title="المشتركون"
          value={isLoading ? '...' : (dash?.totalSubscribers ?? 0)}
          sub="مستخدمو RADIUS"
          icon={Users}
          color="text-blue-500"
        />
        <StatCard
          title="أجهزة NAS"
          value={nasList?.length ?? '—'}
          sub="العملاء المسجلون"
          icon={Server}
          color="text-purple-500"
        />
        <StatCard
          title="الكروت الإجمالية"
          value={isLoading ? '...' : (dash?.cards.total ?? 0)}
          sub={`نشط: ${dash?.cards.active ?? 0} | غير مستخدم: ${dash?.cards.unused ?? 0}`}
          icon={CreditCard}
          color="text-orange-500"
        />
      </div>

      {/* traffic summary row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="تنزيل نشط الآن"
          value={fmtBytes(dash?.downloadBytesActive ?? 0)}
          sub="مجموع الجلسات المفتوحة"
          icon={TrendingDown}
          color="text-cyan-500"
        />
        <StatCard
          title="رفع نشط الآن"
          value={fmtBytes(dash?.uploadBytesActive ?? 0)}
          sub="مجموع الجلسات المفتوحة"
          icon={TrendingUp}
          color="text-pink-500"
        />
        <StatCard
          title="إجمالي التنزيل"
          value={fmtBytes(dash?.totalDownloadBytes ?? 0)}
          sub="منذ البداية"
          icon={BarChart3}
          color="text-cyan-400"
        />
        <StatCard
          title="إجمالي الرفع"
          value={fmtBytes(dash?.totalUploadBytes ?? 0)}
          sub="منذ البداية"
          icon={Activity}
          color="text-pink-400"
        />
      </div>

      {/* charts row */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* daily area chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">النشاط اليومي (آخر 7 أيام)</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChart.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" GB" />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v: number, n: string) => [`${v} GB`, n]}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="تنزيل" stroke="#06b6d4" fill="url(#gDown)" strokeWidth={2} />
                  <Area type="monotone" dataKey="رفع"   stroke="#ec4899" fill="url(#gUp)"  strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* voucher pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">حالة الكروت</CardTitle>
          </CardHeader>
          <CardContent>
            {dash?.cards.total === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">لا توجد كروت</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={cardPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {cardPieData.map((_, i) => (
                      <Cell key={i} fill={CARD_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, n]} />
                  <Legend
                    formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {CARD_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CARD_COLORS[i] }} />
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="font-medium">{cardPieData[i]?.value ?? 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* sessions per day bar + top plans row */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* sessions bar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">الجلسات اليومية (آخر 7 أيام)</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChart.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="جلسات" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* top plans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">أكثر الخطط نشاطاً</CardTitle>
          </CardHeader>
          <CardContent>
            {!dash?.topPlans?.length ? (
              <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات</p>
            ) : (
              <div className="space-y-3">
                {dash.topPlans.map((p: { name: string; count: number }, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate flex-1">{p.name}</span>
                    <Badge variant="secondary">{p.count} متصل</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* active sessions table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-5 w-5 text-green-500" />
            الجلسات النشطة الآن
            {sessions && (
              <Badge variant="success" className="mr-2">{sessions.length} متصل</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!sessions?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">لا توجد جلسات نشطة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">المستخدم</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">IP الجهاز</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">IP المُسند</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">تنزيل</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">رفع</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">وقت البداية</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 15).map((s: {
                    radacctid: number; username: string; nasipaddress: string;
                    framedipaddress: string; acctstarttime: string;
                    acctinputoctets: number; acctoutputoctets: number;
                  }) => (
                    <tr key={s.radacctid} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{s.username}</td>
                      <td className="py-2 px-3 text-muted-foreground font-mono text-xs">{s.nasipaddress}</td>
                      <td className="py-2 px-3 font-mono text-xs">{s.framedipaddress || '—'}</td>
                      <td className="py-2 px-3 text-cyan-600 text-xs">{fmtBytes(s.acctoutputoctets ?? 0)}</td>
                      <td className="py-2 px-3 text-pink-600 text-xs">{fmtBytes(s.acctinputoctets  ?? 0)}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {s.acctstarttime ? new Date(s.acctstarttime).toLocaleString('ar-EG') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
