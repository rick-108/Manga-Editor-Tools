import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8">
          <div className="flex flex-1 items-center justify-between">
            <nav className="flex items-center space-x-6 space-x-reverse text-sm font-medium">
              <Link href="/" className="transition-colors hover:text-foreground/80 font-bold text-xl text-primary tracking-tight">
                RTN مانغا
              </Link>
              <Link href="/manga" className="transition-colors hover:text-foreground/80 text-foreground/60">
                المكتبة
              </Link>
            </nav>
            <div className="flex items-center space-x-3 space-x-reverse">
              <button
                onClick={toggle}
                aria-label="تبديل المظهر"
                className="rounded-full p-2 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              {user ? (
                <>
                  <Link href="/profile" className="text-sm font-medium hover:text-primary transition-colors">
                    {user.username}
                  </Link>
                  <Button variant="outline" size="sm" onClick={logout}>
                    تسجيل الخروج
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
                    تسجيل الدخول
                  </Link>
                  <Link href="/register">
                    <Button size="sm">إنشاء حساب</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-border/40 py-6 md:py-0">
        <div className="container flex flex-col items-center justify-center gap-4 md:h-16 md:flex-row max-w-screen-2xl px-4 md:px-8">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            بني بواسطة RTN Manga. جميع الحقوق محفوظة.
          </p>
          <div className="md:mr-auto flex gap-4">
             <Link href="/publish" className="text-sm text-muted-foreground hover:text-primary transition-colors">
               لوحة الناشر
             </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
