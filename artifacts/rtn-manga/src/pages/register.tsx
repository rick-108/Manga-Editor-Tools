import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRegister } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setUser, setToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegister();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate(
      { data: { username, email, password } },
      {
        onSuccess: (data) => {
          if (data.success) {
            setToken(data.token);
            setUser(data.user);
            toast({ title: "تم إنشاء الحساب بنجاح" });
            setLocation("/");
          } else {
            toast({ variant: "destructive", title: "فشل إنشاء الحساب", description: data.message || "البيانات غير صالحة" });
          }
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء الاتصال بالخادم" });
        }
      }
    );
  };

  return (
    <div className="container max-w-md mx-auto py-24 px-4 flex flex-col items-center">
      <div className="w-full bg-card p-8 rounded-xl border border-border shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 tracking-tight">إنشاء حساب</h1>
          <p className="text-muted-foreground text-sm">انضم إلى مجتمع RTN مانغا</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input 
              id="username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required
              minLength={3}
              className="bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني (اختياري)</Label>
            <Input 
              id="email" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input 
              id="password" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              minLength={6}
              className="bg-background"
            />
          </div>

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">لديك حساب بالفعل؟ </span>
          <Link href="/login" className="text-primary hover:underline font-medium">
            تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
