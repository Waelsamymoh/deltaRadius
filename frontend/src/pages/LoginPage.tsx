import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Radio } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const schema = z.object({
  email: z.string().min(1, 'مطلوب'),
  password: z.string().min(1, 'مطلوب'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setError('')
      await login(data.email, data.password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="p-3 bg-primary rounded-full">
              <Radio className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">RadiusManager</CardTitle>
          <CardDescription>سجّل دخولك للمتابعة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">اسم المستخدم</Label>
              <Input
                id="email"
                type="text"
                placeholder="admin1"
                {...register('email')}
                className="text-right"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'جاري تسجيل الدخول...' : 'دخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
