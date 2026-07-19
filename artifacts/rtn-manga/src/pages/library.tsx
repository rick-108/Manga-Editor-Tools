import { useUser } from "@clerk/react";
import { useUserProfile } from "@/contexts/user-profile-context";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookMarked, BookOpen, Search, Zap, Trash2, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

type LibraryManga = {
  id: number;
  title: string;
  coverImage: string | null;
  type: string;
  status: string;
  latestChapterNumber: number | null;
  chapterCount?: number;
};

export default function Library() {
  const { user, isLoaded } = useUser();
  const { dbProfile } = useUserProfile();
  const [, setLocation] = useLocation();

  const [library, setLibrary] = useState<LibraryManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isLoaded && !user) setLocation("/sign-in");
  }, [isLoaded, user, setLocation]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setLibrary(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleRemove = async (mangaId: number) => {
    setRemoving(mangaId);
    try {
      await fetch(`/api/library/${mangaId}`, { method: "DELETE" });
      setLibrary((prev) => prev.filter((m) => m.id !== mangaId));
    } catch {}
    setRemoving(null);
  };

  const filtered = search.trim()
    ? library.filter((m) => m.title.toLowerCase().includes(search.trim().toLowerCase()))
    : library;

  const level = dbProfile?.level ?? 1;
  const currentXp = dbProfile?.currentXp ?? 0;
  const xpInLevel = currentXp % 100;

  if (!isLoaded) {
    return (
      <div className="container max-w-5xl mx-auto py-12 px-4">
        <Skeleton className="h-40 w-full rounded-2xl mb-8" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="w-full aspect-[2/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const typeLabel = (t: string) => t === "manga" ? "مانغا" : "مانهوا";
  const statusLabel = (s: string) => s === "ongoing" ? "مستمر" : s === "completed" ? "مكتمل" : "متوقف";

  return (
    <div className="w-full pb-24">
      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-background border-b border-border/50">
        {/* Decorative blur circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="relative container max-w-5xl mx-auto px-4 py-10 md:py-14">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Title + count */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary text-sm font-semibold">
                <BookMarked className="w-4 h-4" />
                <span>مكتبتي الشخصية</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {loading ? (
                  <Skeleton className="h-10 w-48 inline-block" />
                ) : (
                  <>
                    <span className="text-primary">{library.length}</span>
                    <span className="text-foreground/80 mr-2 text-2xl font-medium">عمل محفوظ</span>
                  </>
                )}
              </h1>
            </div>

            {/* XP badge */}
            <div className="flex items-start gap-4">
              <div className="bg-card border border-border/60 rounded-2xl px-5 py-4 min-w-[160px] shadow-sm">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="text-xs font-bold text-yellow-400">مستوى {level}</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${xpInLevel}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-left">{xpInLevel}/100 XP</p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          {!loading && library.length > 0 && (
            <div className="mt-6 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث في مكتبتك..."
                className="w-full max-w-sm bg-background/80 border border-border/60 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="container max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-full aspect-[2/3] rounded-xl" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : library.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-secondary/40 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">مكتبتك فارغة</h2>
              <p className="text-muted-foreground text-sm max-w-xs">
                ابدأ بإضافة أعمال تعجبك لمتابعتها وقراءتها لاحقاً
              </p>
            </div>
            <Link href="/manga">
              <Button className="gap-2">
                <Search className="w-4 h-4" />
                تصفح الأعمال
              </Button>
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>لا توجد نتائج لـ "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 md:gap-5">
            {filtered.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                onRemove={handleRemove}
                removing={removing === manga.id}
                typeLabel={typeLabel}
                statusLabel={statusLabel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MangaCard({
  manga,
  onRemove,
  removing,
  typeLabel,
  statusLabel,
}: {
  manga: LibraryManga;
  onRemove: (id: number) => void;
  removing: boolean;
  typeLabel: (t: string) => string;
  statusLabel: (s: string) => string;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-secondary/30 shadow hover:shadow-lg transition-all duration-300 mb-2 border border-border/30 hover:border-primary/30">
        <img
          src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"}
          alt={manga.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        {/* Gradient overlay on hover */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 ${showActions ? "opacity-100" : "opacity-0"}`} />

        {/* Action buttons */}
        <div className={`absolute inset-0 flex flex-col justify-end p-2 gap-1.5 transition-opacity duration-300 ${showActions ? "opacity-100" : "opacity-0"}`}>
          <Link href={`/manga/${manga.id}`}>
            <button className="w-full flex items-center justify-center gap-1.5 bg-primary text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
              <ExternalLink className="w-3 h-3" />
              عرض
            </button>
          </Link>
          <button
            onClick={(e) => { e.preventDefault(); onRemove(manga.id); }}
            disabled={removing}
            className="w-full flex items-center justify-center gap-1.5 bg-black/60 border border-white/20 text-white text-[10px] font-medium py-1.5 rounded-lg hover:bg-destructive/80 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
            {removing ? "..." : "إزالة"}
          </button>
        </div>

        {/* Status badge */}
        <div className="absolute top-1.5 right-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            manga.status === "ongoing" ? "bg-green-500/90 text-white" :
            manga.status === "completed" ? "bg-primary/90 text-white" :
            "bg-yellow-500/90 text-black"
          }`}>
            {statusLabel(manga.status)}
          </span>
        </div>

        {/* Latest chapter badge */}
        {manga.latestChapterNumber && (
          <div className="absolute bottom-1.5 left-1.5">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-black/70 text-white/90 border border-white/10">
              ف {manga.latestChapterNumber}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <Link href={`/manga/${manga.id}`}>
        <p className="text-xs font-semibold line-clamp-2 leading-tight hover:text-primary transition-colors cursor-pointer">
          {manga.title}
        </p>
      </Link>
      <p className="text-[10px] text-muted-foreground mt-0.5">{typeLabel(manga.type)}</p>
    </div>
  );
}
