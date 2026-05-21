import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Star, Wifi, ChevronLeft, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'

const schema = z.object({
  networkName: z.string().min(2, 'اسم الشبكة مطلوب'),
  subdomain: z
    .string()
    .min(3, '3 أحرف على الأقل')
    .max(32, '32 حرف كحد أقصى')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'حروف إنجليزية صغيرة وأرقام وشرطة فقط'),
  email: z.string().min(3, '3 أحرف على الأقل').regex(
    /^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_.@\-]{3,50})$/,
    'أدخل بريد إلكتروني أو اسم مستخدم صحيح'
  ),
  phone: z
    .string()
    .min(8, 'رقم الموبايل مطلوب')
    .regex(/^[+\d][\d\s-]{6,}$/, 'أدخل رقم موبايل صحيح'),
  password: z.string().min(6, '6 أحرف على الأقل'),
  confirmPassword: z.string().min(1, 'مطلوب'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

const STATS = [
  { value: '+٢٠٠', label: 'شبكة نشطة' },
  { value: '+١٥٠٠٠', label: 'مشترك مُدار' },
  { value: '+٦٠', label: 'ميزة متكاملة' },
  { value: '٢٤/٧', label: 'دعم فني' },
]

const FEATURES = [
  { title: 'إدارة المشتركين', desc: 'أنشئ حسابات المشتركين وحدد باقاتهم وحصصهم بضغطة زر.' },
  { title: 'RADIUS متكامل', desc: 'تكامل كامل مع FreeRADIUS للمصادقة والمحاسبة في الوقت الفعلي.' },
  { title: 'بطاقات الشحن', desc: 'أنشئ آلاف البطاقات المسبقة الدفع تلقائياً بأي حجم وطباعتها.' },
  { title: 'إحصاءات لحظية', desc: 'تابع الاستهلاك والجلسات والإيرادات من لوحة تحكم واحدة.' },
  { title: 'حصص البيانات', desc: 'تحكم في حصص التحميل والرفع مع إجراءات تلقائية عند الانتهاء.' },
  { title: 'عزل تام للشبكات', desc: 'كل شبكة معزولة ببياناتها وإعداداتها ومستخدميها على رابطها.' },
]

const PLANS = [
  {
    name: 'المبتدئ',
    price: 'مجاناً',
    period: '',
    desc: 'للشبكات الصغيرة والتجريب',
    highlight: false,
    features: ['حتى ٥٠ مشترك', 'إدارة المستخدمين والباقات', 'بطاقات شحن محدودة', 'إحصاءات أساسية', 'دعم بريد إلكتروني'],
    cta: 'ابدأ مجاناً',
  },
  {
    name: 'الاحترافي',
    price: '١٤٩ ج.م',
    period: '/ شهرياً',
    desc: 'للشبكات المتوسطة والمتنامية',
    highlight: true,
    features: ['مشتركون غير محدودون', 'بطاقات شحن غير محدودة', 'تقارير وإحصاءات متقدمة', 'إدارة حصص البيانات', 'دعم SSTP و PPPoE', 'دعم فني أولوية'],
    cta: 'ابدأ الآن',
  },
  {
    name: 'المؤسسي',
    price: 'تواصل معنا',
    period: '',
    desc: 'للشبكات الكبيرة والمحترفين',
    highlight: false,
    features: ['كل مميزات الاحترافي', 'دعم على مدار الساعة', 'إعداد وتهيئة مجانية', 'تدريب الفريق', 'اتفاقية مستوى خدمة SLA', 'حلول مخصصة'],
    cta: 'تواصل معنا',
  },
]

export default function LandingPage() {
  const [showForm, setShowForm] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const subdomain = watch('subdomain') ?? ''

  const registerMutation = useMutation({
    mutationFn: (data: FormData) => authApi.selfRegister(data).then(r => r.data),
    onSuccess: (data) => {
      // Remember the apex-side session so future visits to landing auto-redirect.
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('tenant_subdomain', data.subdomain)
      // Drop the user straight into their dashboard with an auto-login hash —
      // no second login step. selfRegister already returned a valid token.
      const payload = encodeURIComponent(JSON.stringify({
        token: data.access_token, user: data.user,
      }))
      window.location.href = `${getDashboardUrl(data.subdomain)}/dashboard#auto-login=${payload}`
    },
  })

  // If this browser already has an active session (remembered after a previous
  // signup or apex login), bounce the visitor straight to their dashboard.
  // Signed-out users carry a ?logout=1 marker — we wipe the apex session and
  // show the landing instead of redirecting.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('logout') === '1') {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('tenant_subdomain')
        // Strip the marker from the URL so a manual refresh doesn't repeat the wipe.
        history.replaceState(null, '', window.location.pathname)
        return
      }
      const token = localStorage.getItem('token')
      const userRaw = localStorage.getItem('user')
      const sub = localStorage.getItem('tenant_subdomain')
      if (!token || !userRaw || !sub) return
      const user = JSON.parse(userRaw)
      const payload = encodeURIComponent(JSON.stringify({ token, user }))
      window.location.href = `${getDashboardUrl(sub)}/dashboard#auto-login=${payload}`
    } catch { /* ignore — render landing */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getBaseDomain = () => {
    const parts = window.location.hostname.split('.')
    return parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
  }

  const getAdminUrl = () => {
    const port = window.location.port
    return `${window.location.protocol}//admin.${getBaseDomain()}${port ? ':' + port : ''}`
  }

  const getDashboardUrl = (sub: string) => {
    const port = window.location.port
    return `${window.location.protocol}//${sub}.${getBaseDomain()}${port ? ':' + port : ''}`
  }

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  /* ── Loading screen while the browser navigates to the new dashboard ── */
  if (registerMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
            <CheckCircle className="h-12 w-12 text-primary animate-pulse" />
          </div>
          <h2 className="text-3xl font-black text-white">شبكتك جاهزة!</h2>
          <p className="text-muted-foreground text-lg">جاري تحويلك إلى لوحة التحكم...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#111] min-h-screen text-white" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#111]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl">
            <Wifi className="h-5 w-5 text-primary" />
            <span>Delta<span className="text-primary">Group</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">المميزات</button>
            <button onClick={() => scrollTo('plans')} className="hover:text-white transition-colors">الخطط</button>
            <button onClick={() => scrollTo('register-form')} className="hover:text-white transition-colors">ابدأ الآن</button>
          </div>
          <Link
            to="/login"
            className="flex items-center gap-1.5 border border-white/20 hover:border-primary hover:text-primary text-sm font-semibold px-4 py-2 rounded-full transition-all"
          >
            <LogIn className="h-3.5 w-3.5" />
            دخول العملاء
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-16 min-h-screen flex flex-col justify-center relative overflow-hidden">
        {/* background grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 60px)' }} />
        {/* orange glow */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 w-full py-20 grid md:grid-cols-2 gap-12 items-center relative z-10">
          {/* Text */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 text-primary text-sm font-semibold px-4 py-1.5 rounded-full">
              نظام إدارة شبكات الإنترنت
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
              أدر<br />
              <span className="text-primary">شبكتك.</span><br />
              باحترافية.
            </h1>
            <p className="text-white/60 text-lg max-w-md leading-relaxed font-medium">
              منصة متكاملة لإدارة مشتركي الإنترنت عبر RADIUS — حسابات، باقات، حصص، وإحصاءات. كل شيء بالعربية.
            </p>
            <div className="flex gap-3 flex-wrap pt-2">
              <button
                onClick={() => { setShowForm(true); setTimeout(() => scrollTo('register-form'), 100) }}
                className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-3.5 rounded-full text-base transition-all flex items-center gap-2"
              >
                أنشئ شبكتك مجاناً
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scrollTo('features')}
                className="border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-3.5 rounded-full text-base transition-all"
              >
                اعرف أكثر
              </button>
            </div>
          </div>

          {/* Visual card */}
          <div className="hidden md:block relative">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 backdrop-blur">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center font-black text-white text-sm">DG</div>
                <div>
                  <div className="font-bold text-sm">لوحة تحكم الشبكة</div>
                  <div className="text-xs text-white/40">myisp.delta-group.online</div>
                </div>
                <div className="mr-auto flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400 font-medium">نشط</span>
                </div>
              </div>
              {[
                { label: 'المشتركون النشطون', val: '١٢٤', color: 'text-primary' },
                { label: 'الجلسات الحالية', val: '٨٧', color: 'text-green-400' },
                { label: 'إجمالي البيانات اليوم', val: '٢.٤ تيرا', color: 'text-blue-400' },
                { label: 'الإيرادات هذا الشهر', val: '١٢,٤٠٠ ج.م', color: 'text-amber-400' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-white/60">{r.label}</span>
                  <span className={`font-black text-lg ${r.color}`}>{r.val}</span>
                </div>
              ))}
              <div className="pt-1">
                <div className="text-xs text-white/40 mb-2">استهلاك البيانات</div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '68%' }} />
                </div>
                <div className="flex justify-between text-xs text-white/40 mt-1">
                  <span>٦٨٪ مستخدم</span>
                  <span>٣٢٪ متبقي</span>
                </div>
              </div>
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-4 -right-4 bg-primary text-white text-xs font-black px-4 py-2 rounded-full shadow-lg shadow-primary/30">
              +١٢ مشترك هذا الأسبوع
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-white/10 bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-black text-primary">{s.value}</div>
                <div className="text-sm text-white/50 font-medium mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <p className="text-primary font-bold text-sm mb-2">المميزات</p>
            <h2 className="text-4xl md:text-5xl font-black">كل ما تحتاجه<br /><span className="text-white/40">لإدارة شبكتك.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`p-6 rounded-2xl border border-white/5 hover:border-primary/40 transition-all group ${i === 0 ? 'bg-primary/10' : 'bg-white/[0.03]'}`}>
                <div className="text-4xl font-black text-primary/20 group-hover:text-primary/40 transition-colors mb-4 font-mono">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <p className="text-primary font-bold text-sm mb-2">الخطط والأسعار</p>
            <h2 className="text-4xl md:text-5xl font-black">ابدأ مجاناً،<br /><span className="text-white/40">طوّر مع نموك.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-7 flex flex-col border transition-all ${
                  plan.highlight
                    ? 'border-primary bg-primary/10'
                    : 'border-white/8 bg-white/[0.03] hover:border-white/20'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 right-6">
                    <span className="inline-flex items-center gap-1 bg-primary text-white text-xs font-black px-3 py-1 rounded-full">
                      <Star className="h-3 w-3 fill-white" />
                      الأكثر شيوعاً
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="font-black text-xl mb-1">{plan.name}</h3>
                  <p className="text-white/50 text-sm mb-4">{plan.desc}</p>
                  <div className="flex items-end gap-1">
                    <span className={`text-4xl font-black ${plan.highlight ? 'text-primary' : 'text-white'}`}>
                      {plan.price}
                    </span>
                    {plan.period && <span className="text-white/40 text-sm mb-1">{plan.period}</span>}
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle className={`h-4 w-4 shrink-0 ${plan.highlight ? 'text-primary' : 'text-white/30'}`} />
                      <span className="text-white/70">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    if (plan.name === 'المؤسسي') {
                      window.location.href = `mailto:info@${getBaseDomain()}`
                    } else {
                      setShowForm(true)
                      setTimeout(() => scrollTo('register-form'), 100)
                    }
                  }}
                  className={`w-full py-3 rounded-full font-bold text-sm transition-all ${
                    plan.highlight
                      ? 'bg-primary hover:bg-primary/90 text-white'
                      : 'border border-white/20 hover:border-white/40 text-white'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Register ── */}
      <section id="register-form" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* Left text */}
          <div className="space-y-4">
            <p className="text-primary font-bold text-sm">أنشئ شبكتك</p>
            <h2 className="text-4xl md:text-5xl font-black leading-tight">
              شبكتك تشتغل<br />
              <span className="text-white/40">خلال دقيقتين.</span>
            </h2>
            <p className="text-white/50 leading-relaxed">
              سجّل الآن واحصل على لوحة تحكم كاملة على رابطك الخاص. لا بطاقة ائتمان، لا تعقيدات.
            </p>
            <div className="space-y-3 pt-2">
              {['إعداد فوري بدون خبرة تقنية', 'رابط خاص بشبكتك', 'دعم فني متاح دائماً'].map(t => (
                <div key={t} className="flex items-center gap-3 text-sm text-white/70">
                  <div className="h-5 w-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-3 w-3 text-primary" />
                  </div>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className={`rounded-2xl border border-white/10 p-8 bg-white/[0.03] ${!showForm ? 'flex items-center justify-center py-16' : ''}`}>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="bg-primary hover:bg-primary/90 text-white font-black px-10 py-4 rounded-full text-lg transition-all"
              >
                ابدأ مجاناً الآن
              </button>
            ) : (
              <form onSubmit={handleSubmit(d => registerMutation.mutate(d))} className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">اسم الشبكة / الشركة</Label>
                  <Input
                    {...register('networkName')}
                    placeholder="شركة المستقبل للإنترنت"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11"
                  />
                  {errors.networkName && <p className="text-xs text-destructive">{errors.networkName.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">رابط لوحة التحكم</Label>
                  <div className="flex">
                    <Input
                      {...register('subdomain')}
                      placeholder="myisp"
                      dir="ltr"
                      className="rounded-l-none border-l-0 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11 font-mono text-left"
                    />
                    <span className="flex items-center bg-white/[0.07] border border-white/10 border-r-0 rounded-r-md px-3 text-xs text-white/40 font-mono whitespace-nowrap">
                      .{getBaseDomain()}
                    </span>
                  </div>
                  {subdomain && !errors.subdomain && (
                    <p className="text-xs text-primary font-mono">✓ {getDashboardUrl(subdomain)}</p>
                  )}
                  {errors.subdomain && <p className="text-xs text-destructive">{errors.subdomain.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">البريد الإلكتروني أو اسم المستخدم</Label>
                  <Input
                    {...register('email')}
                    type="text"
                    placeholder="admin أو admin@myisp.com"
                    dir="ltr"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11 text-left"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">رقم الموبايل</Label>
                  <Input
                    {...register('phone')}
                    type="tel"
                    placeholder="01012345678"
                    dir="ltr"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11 text-left"
                  />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">كلمة المرور</Label>
                  <Input
                    {...register('password')}
                    type="password"
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11"
                  />
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-white/80 font-semibold">تأكيد كلمة المرور</Label>
                  <Input
                    {...register('confirmPassword')}
                    type="password"
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary h-11"
                  />
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
                </div>

                {registerMutation.isError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2.5">
                    {(registerMutation.error as any)?.response?.data?.message ?? 'حدث خطأ، حاول مجدداً'}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-black py-3.5 rounded-full text-base transition-all mt-2"
                >
                  {registerMutation.isPending ? 'جاري الإنشاء...' : 'أنشئ شبكتي الآن'}
                </button>
                <p className="text-center text-xs text-white/30">
                  بالتسجيل أنت توافق على شروط الخدمة وسياسة الخصوصية
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-black text-lg">
            <Wifi className="h-5 w-5 text-primary" />
            <span>Delta<span className="text-primary">Group</span></span>
          </div>
          <p className="text-white/30 text-sm">© {new Date().getFullYear()} Delta Group — جميع الحقوق محفوظة</p>
          <a href={getAdminUrl()} className="text-white/30 hover:text-white text-sm transition-colors">
            دخول المدراء
          </a>
        </div>
      </footer>

    </div>
  )
}
