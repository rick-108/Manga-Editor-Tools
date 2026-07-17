import { useState } from "react";
import { Link } from "wouter";
import { Menu } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8">
          <div className="flex flex-1 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="font-bold text-xl text-primary tracking-tight hover:opacity-80 transition-opacity">
              RTN مانغا
            </Link>

            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="فتح القائمة"
              className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="border-t border-border/40 py-6 md:py-0">
        <div className="container flex flex-col items-center justify-center gap-4 md:h-14 md:flex-row max-w-screen-2xl px-4 md:px-8">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} RTN Manga — جميع الحقوق محفوظة
          </p>
        </div>
      </footer>
    </div>
  );
}
