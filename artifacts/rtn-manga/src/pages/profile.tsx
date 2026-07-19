import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  LogOut, User as UserIcon, History, BookMarked,
  BookOpen, Camera, Check, Pencil, X, Zap, Eye,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/contexts/user-profile-context";

type LibraryManga = {
  id: number; title: string; coverImage: string | null;
  type: string; latestChapterNumber: number | null;
};
type ProgressItem = {
  mangaId: number; mangaTitle: string; mangaCover: string | null;
  chapterId: number; chapterNumber: number | null; updatedAt: string;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { dbProfile, refreshProfile } = useUserProfile();

  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Library + progress
  const [library, setLibrary] = useState<LibraryManga[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [progLoading, setProgLoading] = useState(true);

  // Redirect if not signed in
  useEffect(() => {
    if (isLoaded && !user) setLocation("/sign-in");
  }, [isLoaded, user, setLocation]);

  // Load library and progress
  useEffect(() => {
    if (!user) return;
    fetch("/api/library").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setLibrary(d);
    }).catch(() => {}).finally(() => setLibLoading(false));

    fetch("/api/progress").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setProgress(d);
    }).catch(() => {}).finally(() => setProgLoading(false));
  }, [user]);

  // ── Save display name ──────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameInput.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        refreshProfile();
        setEditingName(false);
        toast({ title: "تم حفظ الاسم بنجاح ✓" });
      } else {
        toast({ variant: "destructive", title: d.error || "فشل الحفظ" });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في الشبكة" });
    } finally {
      setSavingName(false);
    }
  };

  // ── Upload avatar via Telegram ─────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const r = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const d = await r.json();
      if (r.ok) {
        refreshProfile(); // Sync context → sidebar updates immediately
        toast({ title: "تم رفع الصورة بنجاح ✓" });
      } else {
        toast({ variant: "destructive", title: d.error || "فشل رفع الصورة" });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في رفع الصورة" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4 space-y-8">
        <div className="flex items-center gap-6 p-8 bg-card rounded-xl border border-border">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const displayName = dbProfile?.displayName || user.username || user.firstName || "المستخدم";
  const avatarSrc = dbProfile?.avatarUrl || user.imageUrl || null;
  const joinedAt = user.createdAt ? format(new Date(user.createdAt), "yyyy/MM/dd") : "";

  // XP calculations
  const currentXp = dbProfile?.currentXp ?? 0;
  const level = dbProfile?.level ?? 1;
  const xpInLevel = currentXp % 100;
  const xpProgress = xpInLevel; // out of 100
  const viewedChaptersCount = dbProfile?.viewedChaptersCount ?? 0;

  return (
    <div className="container max-w-4xl mx-auto py-12 px-4 space-y-10">

      {/* ── User card ─────────────────────────────────────────────────────── */}
      <div className="p-6 md:p-8 bg-card rounded-2xl border border-border shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">

          {/* Avatar + upload */}
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-background overflow-hidden shadow-md">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" key={avatarSrc} />
                ) : (
                  <UserIcon className="w-10 h-10" />
                )}
                {uploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {/* Camera button */}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="تغيير الصورة الشخصية"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name + email */}
            <div className="text-center md:text-right space-y-2 pt-1">
              {/* Display name row */}
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="h-9 text-lg font-bold w-48 md:w-64"
                    autoFocus
                    maxLength={80}
                    placeholder="اسم العرض"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !nameInput.trim()}
                    className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 shrink-0"
                  >
                    {savingName ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center md:justify-start">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{displayName}</h1>
                  <button
                    onClick={() => { setNameInput(displayName); setEditingName(true); }}
                    className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-md hover:bg-secondary"
                    title="تعديل اسم العرض"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
              {user.primaryEmailAddress && (
                <p className="text-sm text-muted-foreground">{user.primaryEmailAddress.emailAddress}</p>
              )}
              {joinedAt && (
                <span className="text-xs text-muted-foreground/80 bg-secondary px-3 py-1 rounded-full inline-block">
                  عضو منذ: {joinedAt}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="gap-2 shrink-0"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>

        {/* ── XP Progress Bar ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Zap className="w-4 h-4" />
              <span>مستوى {level}</span>
            </div>
            <span className="text-muted-foreground text-xs">
              {xpInLevel} / 100 XP
            </span>
          </div>
          <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${xpProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground/60 text-left">
            إجمالي النقاط: {currentXp} XP
          </p>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* XP total */}
          <div className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/40">
            <div className="w-9 h-9 rounded-lg bg-yellow-400/15 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none">{currentXp.toLocaleString("ar-EG")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">إجمالي XP</p>
            </div>
          </div>

          {/* Viewed chapters */}
          <div className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/40">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none">{viewedChaptersCount.toLocaleString("ar-EG")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">فصول تمت قراءتها</p>
            </div>
          </div>
        </div>

        {/* Upload hint */}
        <p className="text-xs text-muted-foreground/60 text-center md:text-right">
          اضغط على أيقونة الكاميرا لتغيير صورتك الشخصية • يُقبل JPG، PNG، WEBP (حتى 8 ميغابايت)
        </p>
      </div>

      {/* ── Library ───────────────────────────────────────────────────────── */}
      <div id="library" className="space-y-5">
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">مكتبتي</h2>
          {!libLoading && (
            <span className="text-sm text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {library.length}
            </span>
          )}
        </div>
        {libLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-full aspect-[2/3] rounded-lg" />)}
          </div>
        ) : library.length === 0 ? (
          <div className="bg-secondary/20 rounded-xl border border-border/50 p-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>لم تُضَف أي أعمال بعد.</p>
            <Link href="/manga">
              <Button variant="outline" size="sm" className="mt-4">تصفح الأعمال</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {library.map((manga) => (
              <Link key={manga.id} href={`/manga/${manga.id}`} className="group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary/30 mb-1.5 shadow hover:shadow-lg transition-shadow">
                  <img
                    src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666"}
                    alt={manga.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">{manga.title}</p>
                {manga.latestChapterNumber && (
                  <p className="text-[10px] text-muted-foreground">فصل {manga.latestChapterNumber}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Reading progress ──────────────────────────────────────────────── */}
      <div id="history" className="space-y-5">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">سجل القراءة</h2>
          {!progLoading && (
            <span className="text-sm text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {progress.length}
            </span>
          )}
        </div>
        {progLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : progress.length === 0 ? (
          <div className="bg-secondary/20 rounded-xl border border-border/50 p-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>لم تقرأ أي فصول بعد.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {progress.map((item) => (
              <Link key={item.mangaId} href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}>
                <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/40 hover:bg-secondary/30 transition-all cursor-pointer group">
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-secondary/40 shrink-0">
                    <img
                      src={item.mangaCover || "https://placehold.co/100x150/1a1a1a/666"}
                      alt={item.mangaTitle}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm group-hover:text-primary transition-colors truncate">{item.mangaTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.chapterNumber ? `الفصل ${item.chapterNumber}` : "فصل"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {format(new Date(item.updatedAt), "yyyy/MM/dd HH:mm")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0">
                    متابعة القراءة
                  </Button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
