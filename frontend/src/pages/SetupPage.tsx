import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Wifi, ShieldCheck } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().min(1, 'مطلوب'),
  password: z.string().min(6, 'على الأقل 6 أحرف'),
  confirmPassword: z.string().min(1, 'مطلوب'),
  fullName: z.string().optional(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function SetupPage() {
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setError('')
      await authApi.setupFirstAdmin({ email: data.email, password: data.password, fullName: data.fullName })
      // Login lives on the apex domain — point setup completion there.
      const parts = window.location.hostname.split('.')
      const baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname
      const port = window.location.port ? `:${window.location.port}` : ''
      window.location.href = `${window.location.protocol}//${baseDomain}${port}/login`
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
    }
  }

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4" dir="rtl">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
            <Wifi className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-white">Delta<span className="text-primary">Group</span></h1>
          <p className="text-white/40 text-sm mt-1 font-medium">مرحباً — ابدأ بإنشاء حساب المشرف العام</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-7 space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/8">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-bold text-sm">إعداد أول مسؤول</div>
              <div className="text-xs text-white/40">أنشئ حساب المشرف للبدء</div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-white/70 font-semibold text-sm">الاسم الكامل (اختياري)</Label>
              <Input
                {...register('fullName')}
                placeholder="محمد أحمد"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-primary h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 font-semibold text-sm">اسم المستخدم / البريد الإلكتروني</Label>
              <Input
                {...register('email')}
                placeholder="admin@example.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-primary h-11"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 font-semibold text-sm">كلمة المرور</Label>
              <Input
                type="password"
                {...register('password')}
                placeholder="••••••••"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-primary h-11"
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 font-semibold text-sm">تأكيد كلمة المرور</Label>
              <Input
                type="password"
                {...register('confirmPassword')}
                placeholder="••••••••"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-primary h-11"
              />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-black py-3.5 rounded-full text-base transition-all"
            >
              {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الحساب والبدء'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
