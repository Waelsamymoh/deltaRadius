import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wifi, LogOut, Calendar, Download, Upload, Clock, Gauge, Phone, KeyRound, Gift } from 'lucide-react'
import { subscriberPortalApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOKEN_KEY = 'subscriber_token'

const fmtBytes = (b: number): string => {
  if (!b) return '0'
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b >= 1024)      return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}
const fmtDate = (s: string) => s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function SubscriberPortal() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY))
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const statsQ = useQuery<any>({
    queryKey: ['portal-me', token],
    queryFn: () => subscriberPortalApi.me().then(r => r.data),
    enabled: !!token,
    refetchInterval: 15_000,
    retry: false,
  })

  // Token invalid/expired → drop it back to the login screen
  useEffect(() => {
    if (statsQ.isError) {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
    }
  }, [statsQ.isError])

  const doLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await subscriberPortalApi.login(mobile.trim(), password)
      localStorage.setItem(TOKEN_KEY, res.data.access_token)
      setToken(res.data.access_token)
      setPassword('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'تعذّر تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMobile(''); setPassword('')
  }

  // ── Login screen ──────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4" dir="rtl">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mb-2">
              <Wifi className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">بوابة المشترك</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">ادخل بياناتك لعرض اشتراكك واستهلاكك</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => { e.preventDefault(); doLogin() }} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> رقم الموبايل</label>
                <Input value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                  dir="ltr" inputMode="numeric" placeholder="01XXXXXXXXX" className="text-center" />
              </div>
              <div className="space-y-1">
                <label className="text-sm flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> كلمة المرور</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  dir="ltr" placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !mobile.trim() || !password}>
                {loading ? 'جاري الدخول...' : 'دخول'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Subscriber dashboard ──────────────────────────────────────
  const stats = statsQ.data
  const usage = stats?.usage
  const isTotal = usage?.isTotalQuota
  const remaining = isTotal ? usage?.remainingBytes : usage?.remainingDownloadBytes
  const limit     = isTotal ? usage?.totalLimitBytes : usage?.downloadLimitBytes
  const used      = isTotal ? ((usage?.totalDownloadBytes ?? 0) + (usage?.totalUploadBytes ?? 0)) : (usage?.totalDownloadBytes ?? 0)
  const usedPct   = limit ? Math.min(100, (used / limit) * 100) : 0

  return (
    <div className="min-h-screen bg-muted/20 p-4 sm:p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold">{stats?.firstName || stats?.username || 'مشترك'}</h1>
              <p className="text-xs text-muted-foreground">بوابة المشترك</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="h-4 w-4" /> خروج
          </Button>
        </div>

        {statsQ.isLoading ? (
          <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
        ) : !stats ? (
          <p className="text-center text-muted-foreground py-12">تعذّر تحميل البيانات</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">الأيام المتبقية</p>
                      <p className={`text-2xl font-bold ${stats.remainingDays <= 0 ? 'text-destructive' : stats.remainingDays <= 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {Math.max(0, stats.remainingDays)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">ينتهي {stats.expiresAt}</p>
                    </div>
                    <Calendar className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{isTotal ? 'المتبقي (إجمالي)' : 'المتبقي (تحميل)'}</p>
                      <p className="text-2xl font-bold text-primary">
                        {remaining != null ? fmtBytes(remaining) : 'غير محدود'}
                      </p>
                      {limit != null && <p className="text-[10px] text-muted-foreground">من {fmtBytes(limit)}</p>}
                    </div>
                    <Gauge className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
              <Card className="col-span-2 sm:col-span-1">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">الخطة</p>
                      <p className="text-lg font-bold">{stats.plan?.name ?? '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Usage bar */}
            {limit != null && (
              <Card>
                <CardContent className="pt-5">
                  {(() => {
                    // Bar fills with what's LEFT (consistent with the summary
                    // card). Full bar = lots remaining.
                    const remVal = remaining ?? Math.max(0, limit - used)
                    const remPct = limit > 0 ? Math.min(100, Math.max(0, (remVal / limit) * 100)) : 0
                    const ratio  = limit > 0 ? remVal / limit : 0
                    const fill   = remVal <= 0 ? '#ef4444' : ratio < 0.2 ? '#eab308' : '#3b82f6'
                    return <>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-bold">{fmtBytes(remVal)} / {fmtBytes(limit)}</span>
                      </div>
                      <div className="w-full rounded-full h-3" style={{ backgroundColor: '#e5e7eb' }}>
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{ width: `${remPct}%`, backgroundColor: fill }}
                        />
                      </div>
                    </>
                  })()}
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Download className="h-3 w-3 text-emerald-600" /> تحميل: {fmtBytes(usage?.totalDownloadBytes ?? 0)}</span>
                    <span className="flex items-center gap-1"><Upload className="h-3 w-3 text-blue-600" /> رفع: {fmtBytes(usage?.totalUploadBytes ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bonus / extra quota — only when the subscriber has any */}
            {stats.bonus && stats.bonus.totalBytes > 0 && (
              <Card className="border-purple-300/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gift className="h-4 w-4 text-purple-500" /> الكوته الإضافية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">المتبقي من الباقات الإضافية</span>
                    <span className="font-bold text-purple-600">
                      {fmtBytes(stats.bonus.remainingBytes)} / {fmtBytes(stats.bonus.totalBytes)}
                    </span>
                  </div>
                  <div className="w-full rounded-full h-3" style={{ backgroundColor: '#e5e7eb' }}>
                    {(() => {
                      // Fill with remaining bonus (full = lots left).
                      const remPctBonus = stats.bonus.totalBytes
                        ? Math.min(100, Math.max(0, (stats.bonus.remainingBytes / stats.bonus.totalBytes) * 100))
                        : 0
                      return (
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{ width: `${remPctBonus}%`, backgroundColor: stats.bonus.remainingBytes <= 0 ? '#ef4444' : '#a855f7' }}
                        />
                      )
                    })()}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-muted-foreground">
                      تُستخدم تلقائياً بعد انتهاء كوته الخطة الأساسية.
                    </p>
                    {stats.bonus.nearestExpiry && (
                      <span className="text-[11px] flex items-center gap-1 text-purple-600 font-medium whitespace-nowrap">
                        <Calendar className="h-3 w-3" />
                        تنتهي {new Date(stats.bonus.nearestExpiry).toLocaleDateString('ar-EG', { dateStyle: 'medium' })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent sessions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" /> آخر الجلسات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!(stats.sessions ?? []).length ? (
                  <p className="text-center text-xs text-muted-foreground py-4">لا توجد جلسات</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-right py-2 px-2 font-medium">البداية</th>
                          <th className="text-right py-2 px-2 font-medium">النهاية</th>
                          <th className="text-right py-2 px-2 font-medium">تحميل</th>
                          <th className="text-right py-2 px-2 font-medium">رفع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stats.sessions ?? []).slice(0, 10).map((s: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="py-1.5 px-2">{fmtDate(s.startTime)}</td>
                            <td className="py-1.5 px-2">{s.stopTime ? fmtDate(s.stopTime) : <span className="text-green-600 font-medium">نشطة</span>}</td>
                            <td className="py-1.5 px-2">{fmtBytes(s.downloadBytes)}</td>
                            <td className="py-1.5 px-2">{fmtBytes(s.uploadBytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
