import { Link, useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import { useTheme } from "@/hooks/use-theme";
import { useUserProfile } from "@/contexts/user-profile-context";
import { X, Home, BookOpen, Star, History, LogIn, UserPlus, User, Sun, Moon, BookMarked, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface SidebarNavProps {
  open: boolean;
  onClose: () => void;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SidebarNav({ open, onClose }: SidebarNavProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { theme, toggle } = useTheme();
  const { dbProfile } = useUserProfile();
  const [location] = useLocation();

  useEffect(() => { onClose(); }, [location]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const avatarSrc = dbProfile?.avatarUrl || user?.imageUrl || null;

  const navItems = [
    { href: "/", label: "الصفحة الرئيسية", icon: Home },
    { href: "/manga", label: "تصفح الأعمال", icon: BookMarked },
    { href: "/manga?featured=1", label: "أعمال مختارة", icon: Star },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[300px] max-w-[85vw] bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <span className="font-bold text-lg text-primary">RTN مانغا</span>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User section */}
        <div className="p-5 border-b border-border/60 bg-secondary/30">
          <Show when="signed-in">
            <Link href="/profile">
              <div className="flex items-center gap-4 cursor-pointer group">
                <div className="w-14 h-14 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-primary overflow-hidden shrink-0 group-hover:border-primary transition-colors">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={user?.username ?? ""}
                      className="w-full h-full object-cover"
                      key={avatarSrc}
                    />
                  ) : (
                    <User className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-base group-hover:text-primary transition-colors">
                    {dbProfile?.displayName || user?.username || user?.firstName || "المستخدم"}
                  </p>
                  <p className="text-xs text-muted-foreground">الملف الشخصي</p>
                </div>
              </div>
            </Link>
          </Show>

          <Show when="signed-out">
            <p className="text-sm text-muted-foreground mb-3">مرحباً بك في المنصة</p>
            <div className="flex gap-2">
              <Link href="/sign-in" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1.5">
                  <LogIn className="h-3.5 w-3.5" />
                  تسجيل الدخول
                </Button>
              </Link>
              <Link href="/sign-up" className="flex-1">
                <Button size="sm" className="w-full gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  إنشاء حساب
                </Button>
              </Link>
            </div>
          </Show>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {navItems.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href}>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors cursor-pointer group">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-medium group-hover:text-primary transition-colors">{label}</span>
                  </div>
                </Link>
              </li>
            ))}

            <Show when="signed-in">
              <li>
                <Link href="/profile#library">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors cursor-pointer group">
                    <BookOpen className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-medium group-hover:text-primary transition-colors">مكتبتي</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link href="/profile#history">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors cursor-pointer group">
                    <History className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-medium group-hover:text-primary transition-colors">سجل القراءة</span>
                  </div>
                </Link>
              </li>
            </Show>

            <li>
              <Link href="/publish">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors cursor-pointer group">
                  <Lock className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="font-medium group-hover:text-primary transition-colors">لوحة الناشر</span>
                </div>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border/60 flex items-center justify-between">
          <button
            onClick={toggle}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
          </button>

          <Show when="signed-in">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => { signOut({ redirectUrl: basePath || "/" }); onClose(); }}
            >
              تسجيل الخروج
            </Button>
          </Show>
        </div>
      </aside>
    </>
  );
}
