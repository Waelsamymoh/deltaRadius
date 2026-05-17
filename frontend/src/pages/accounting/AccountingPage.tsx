import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Wifi, ShieldCheck } from 'lucide-react'
import { accountingApi } from '@/api/endpoints'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              الجلسات النشطة حالياً
              <Badge variant="success" className="ml-1">{activeSessions.length} متصل</Badge>
            </CardTitle>
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
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              سجلات المصادقة
            </CardTitle>
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
    </div>
  )
}
