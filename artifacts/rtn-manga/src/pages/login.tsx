import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { setUser, setToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          if (data.success) {
            setToken(data.token);
            setUser(data.user);
            toast({ title: "تم تسجيل الدخول بنجاح" });
            setLocation("/");
          } else {
            toast({ variant: "destructive", title: "فشل تسجيل الدخول", description: data.message || "بيانات الاعتماد غير صحيحة" });
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
          <h1 className="text-3xl font-bold mb-2 tracking-tight">تسجيل الدخول</h1>
          <p className="text-muted-foreground text-sm">مرحباً بعودتك إلى RTN مانغا</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input 
              id="username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required
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
              className="bg-background"
            />
          </div>

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "جاري تسجيل الدخول..." : "دخول"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">ليس لديك حساب؟ </span>
          <Link href="/register" className="text-primary hover:underline font-medium">
            إنشاء حساب جديد
          </Link>
        </div>
      </div>
    </div>
  );
}
