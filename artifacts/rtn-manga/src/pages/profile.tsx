import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { LogOut, User as UserIcon, History, BookMarked, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

type LibraryManga = {
  id: number;
  title: string;
  coverImage: string | null;
  type: string;
  latestChapterNumber: number | null;
};

type ProgressItem = {
  mangaId: number;
  mangaTitle: string;
  mangaCover: string | null;
  chapterId: number;
  chapterNumber: number | null;
  updatedAt: string;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();

  const [library, setLibrary] = useState<LibraryManga[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [progLoading, setProgLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && !user) setLocation("/sign-in");
  }, [isLoaded, user, setLocation]);

  useEffect(() => {
    if (!user) return;
    // Clerk uses cookies — no Authorization header needed
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setLibrary(d); })
      .catch(() => {})
      .finally(() => setLibLoading(false));

    fetch("/api/progress")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setProgress(d); })
      .catch(() => {})
      .finally(() => setProgLoading(false));
  }, [user]);

  if (!isLoaded) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4 space-y-8">
        <div className="flex items-center gap-6 p-8 bg-card rounded-xl border border-border">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-32" /></div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.username ?? user.firstName ?? user.primaryEmailAddress?.emailAddress ?? "المستخدم";
  const joinedAt = user.createdAt ? format(new Date(user.createdAt), "yyyy/MM/dd") : "";

  return (
    <div className="container max-w-4xl mx-auto py-12 px-4 space-y-10">
      {/* User card */}
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 p-8 bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-background overflow-hidden shrink-0 shadow-md">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-10 h-10" />
            )}
          </div>
          <div className="text-center md:text-right space-y-1 pt-2">
            <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
            {user.primaryEmailAddress && (
              <p className="text-muted-foreground">{user.primaryEmailAddress.emailAddress}</p>
            )}
            {joinedAt && (
              <p className="text-xs text-muted-foreground/80 mt-2 inline-block bg-secondary px-3 py-1 rounded-full">
                عضو منذ: {joinedAt}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="md:mt-2 gap-2"
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </Button>
      </div>

      {/* Library */}
      <div id="library" className="space-y-5">
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">مكتبتي</h2>
          {!libLoading && <span className="text-sm text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{library.length}</span>}
        </div>
        {libLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-full aspect-[2/3] rounded-lg" />)}
          </div>
        ) : library.length === 0 ? (
          <div className="bg-secondary/20 rounded-xl border border-border/50 p-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>لم تُضَف أي أعمال بعد.</p>
            <Link href="/manga"><Button variant="outline" size="sm" className="mt-4">تصفح المكتبة</Button></Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {library.map((manga) => (
              <Link key={manga.id} href={`/manga/${manga.id}`} className="group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary/30 mb-1.5 shadow hover:shadow-lg transition-shadow">
                  <img src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666"} alt={manga.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
                <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">{manga.title}</p>
                {manga.latestChapterNumber && <p className="text-[10px] text-muted-foreground">فصل {manga.latestChapterNumber}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Reading history */}
      <div id="history" className="space-y-5">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">سجل القراءة</h2>
          {!progLoading && <span className="text-sm text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{progress.length}</span>}
        </div>
        {progLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
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
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-secondary/40 flex-shrink-0">
                    <img src={item.mangaCover || "https://placehold.co/100x150/1a1a1a/666"} alt={item.mangaTitle} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm group-hover:text-primary transition-colors truncate">{item.mangaTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.chapterNumber ? `الفصل ${item.chapterNumber}` : "فصل"}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{format(new Date(item.updatedAt), "yyyy/MM/dd HH:mm")}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">متابعة القراءة</Button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
