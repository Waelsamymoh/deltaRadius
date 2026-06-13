import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Calendar, TrendingUp, Users as UsersIcon, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { reportsApi } from '@/api/endpoints'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const fmtBytes = (b: string | number) => {
  const n = typeof b === 'string' ? Number(b) : b
  if (!n) return '0'
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`
  if (n >= 1024)      return `${(n / 1024).toFixed(2)} KB`
  return `${n} B`
}

const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

type YearlyRow  = { year: number;  totalBytes: string }
type MonthlyRow = { month: number; totalBytes: string }
type DailyRow   = { day: number;   totalBytes: string }

type SubscriberDay = {
  username: string
  firstName: string | null
  mobile: string | null
  totalBytes: string
  downloadBytes: string
  uploadBytes: string
}

export default function ReportsPage() {
  const now = new Date()
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedDay,   setSelectedDay]   = useState<number | null>(null)

  const yearlyQ = useQuery<YearlyRow[]>({
    queryKey: ['reports', 'yearly'],
    queryFn: () => reportsApi.yearly().then(r => r.data),
  })
  const monthlyQ = useQuery<MonthlyRow[]>({
    queryKey: ['reports', 'monthly', selectedYear],
    queryFn: () => reportsApi.monthly(selectedYear).then(r => r.data),
  })
  const dailyQ = useQuery<DailyRow[]>({
    queryKey: ['reports', 'daily', selectedYear, selectedMonth],
    queryFn: () => reportsApi.daily(selectedYear, selectedMonth).then(r => r.data),
  })

  const subsQ = useQuery<SubscriberDay[]>({
    queryKey: ['reports', 'daily-subscribers', selectedYear, selectedMonth, selectedDay],
    queryFn: () => reportsApi.dailySubscribers(selectedYear, selectedMonth, selectedDay!).then(r => r.data),
    enabled: selectedDay !== null,
  })

  const yearly  = yearlyQ.data  ?? []
  const monthly = monthlyQ.data ?? []
  const daily   = dailyQ.data   ?? []

  const yearlyTotal  = yearly.reduce((s, r)  => s + Number(r.totalBytes), 0)
  const monthlyTotal = monthly.reduce((s, r) => s + Number(r.totalBytes), 0)
  const dailyTotal   = daily.reduce((s, r)   => s + Number(r.totalBytes), 0)

  // Chart helpers: map to recharts-friendly shape with numeric `value`
  const yearlyData  = yearly.map(r  => ({ label: String(r.year),  value: Number(r.totalBytes) / 1024 ** 3 }))
  const monthlyData = monthly.map(r => ({ label: monthNames[r.month - 1] ?? r.month, value: Number(r.totalBytes) / 1024 ** 3 }))
  const dailyData   = daily.map(r   => ({ day: r.day, label: String(r.day),  value: Number(r.totalBytes) / 1024 ** 3 }))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="h-7 w-7" /> تقارير الاستهلاك
        </h1>
        <p className="text-muted-foreground mt-1">
          إجمالي البايتات (تحميل + رفع) المستهلكة من قِبل المشتركين
        </p>
      </div>

      {/* Yearly */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> الاستهلاك السنوي
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              الإجمالي: <span className="text-emerald-600 font-bold">{fmtBytes(yearlyTotal)}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {yearlyQ.isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : yearly.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد بيانات استهلاك</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} />
                  <Bar dataKey="value" fill="#10b981" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> الاستهلاك الشهري
            </span>
            <div className="flex items-center gap-3">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
              >
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="text-sm font-normal text-muted-foreground">
                الإجمالي: <span className="text-emerald-600 font-bold">{fmtBytes(monthlyTotal)}</span>
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyQ.isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> الاستهلاك اليومي
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
              >
                {monthNames.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
              >
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="text-sm font-normal text-muted-foreground">
                الإجمالي: <span className="text-emerald-600 font-bold">{fmtBytes(dailyTotal)}</span>
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyQ.isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}GB`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} GB`, 'الاستهلاك']} labelFormatter={l => `يوم ${l} / ${monthNames[selectedMonth - 1]} ${selectedYear}`} />
                  <Bar
                    dataKey="value"
                    fill="#8b5cf6"
                    radius={[6,6,0,0]}
                    cursor="pointer"
                    onClick={(d: any) => d?.day && setSelectedDay(d.day)}
                  />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-center text-xs text-muted-foreground mt-2">
                💡 اضغط على أي يوم لعرض المشتركين الذين استهلكوا خلاله
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscribers-of-the-day modal */}
      {selectedDay !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div
            className="bg-background rounded-lg border max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-primary" />
                  مشتركو يوم {selectedDay} {monthNames[selectedMonth - 1]} {selectedYear}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  مرتّبين حسب أكبر استهلاك أولاً
                </p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-muted rounded-md transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {subsQ.isLoading ? (
                <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
              ) : (subsQ.data ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد جلسات لهذا اليوم</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium w-10">#</th>
                      <th className="text-right py-2 px-3 font-medium">المشترك</th>
                      <th className="text-right py-2 px-3 font-medium">الموبايل</th>
                      <th className="text-right py-2 px-3 font-medium">التحميل</th>
                      <th className="text-right py-2 px-3 font-medium">الرفع</th>
                      <th className="text-left py-2 px-3 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(subsQ.data ?? []).map((s, i) => (
                      <tr key={s.username} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-medium">{s.firstName || s.username}</div>
                          {s.firstName && (
                            <div className="text-[10px] text-muted-foreground font-mono">{s.username}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs" dir="ltr">{s.mobile || '—'}</td>
                        <td className="py-2 px-3 text-xs text-emerald-600">{fmtBytes(s.downloadBytes)}</td>
                        <td className="py-2 px-3 text-xs text-blue-600">{fmtBytes(s.uploadBytes)}</td>
                        <td className="py-2 px-3 text-left font-bold">
                          <Badge variant="outline">{fmtBytes(s.totalBytes)}</Badge>
                        </td>
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
