import { useGetLatestUpdates, useGetMangaStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState, useRef } from "react";
import { ChevronRight, ChevronLeft, Flame, Star } from "lucide-react";

type TrendingManga = {
  id: number;
  title: string;
  coverImage: string | null;
  type: string;
  viewCount: number;
};

type FeaturedManga = {
  id: number;
  title: string;
  coverImage: string | null;
  type: string;
};

function MangaTypeLabel({ type }: { type: string }) {
  return type === "manga" ? "مانغا" : "مانهوا";
}

function TrendingCarousel() {
  const [items, setItems] = useState<TrendingManga[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/manga/trending?limit=10")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setItems(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => goTo((prev) => (prev + 1) % items.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  const goTo = (setter: ((prev: number) => number) | number) => {
    if (animating) return;
    setAnimating(true);
    setActive(typeof setter === "function" ? setter : () => setter);
    setTimeout(() => setAnimating(false), 600);
  };

  const go = (dir: 1 | -1) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo((p) => (p + dir + items.length) % items.length);
  };

  const jump = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(i);
  };

  if (loading) {
    return (
      <div className="w-full aspect-[3/4] md:aspect-[16/7] max-h-[85vh] rounded-2xl bg-secondary/30 animate-pulse flex items-center justify-center">
        <Flame className="h-12 w-12 text-muted-foreground/20" />
      </div>
    );
  }
  if (items.length === 0) return null;

  const current = items[active];
  const cover = current.coverImage || "https://placehold.co/600x900/1a1a1a/444?text=No+Cover";

  return (
    <div className="relative w-full select-none">
      {/* ── Main slide ── */}
      <Link href={`/manga/${current.id}`}>
        <div className="relative w-full aspect-[3/4] md:aspect-[16/7] max-h-[88vh] rounded-2xl overflow-hidden shadow-2xl cursor-pointer group">

          {/* Cover image — fills container */}
          <img
            key={active}
            src={cover}
            alt={current.title}
            className={`absolute inset-0 w-full h-full object-cover object-top transition-all duration-700 ${animating ? "scale-105 opacity-80" : "scale-100 opacity-100"}`}
          />

          {/* Heavy bottom gradient for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Subtle top gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />

          {/* Rank badge — top left */}
          <div className="absolute top-3 right-3 md:top-5 md:right-5 z-10 flex items-center gap-1.5 bg-primary/95 backdrop-blur-sm px-3 py-1 rounded-full shadow-lg">
            <Flame className="h-3.5 w-3.5 text-white" />
            <span className="text-white font-bold text-xs"># {active + 1}</span>
          </div>

          {/* Text overlay — bottom */}
          <div className="absolute bottom-0 inset-x-0 z-10 p-4 md:p-8 pb-10 md:pb-10">
            {/* Type pill */}
            <span className="inline-block mb-2 md:mb-3 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-[11px] md:text-xs font-semibold px-3 py-0.5 rounded-full">
              <MangaTypeLabel type={current.type} />
            </span>

            {/* Title */}
            <h3 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-white leading-tight drop-shadow-lg line-clamp-2 mb-1.5 md:mb-3 group-hover:text-primary/90 transition-colors">
              {current.title}
            </h3>

            {/* Read button — desktop only */}
            <div className="hidden md:flex items-center gap-3 mt-4">
              <span className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-full text-sm shadow-lg transition-all">
                قراءة الآن
              </span>
            </div>
          </div>

          {/* Side arrows — hidden on mobile, hover on desktop */}
          {items.length > 1 && (
            <>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(-1); }}
                className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-all opacity-60 hover:opacity-100"
                aria-label="السابق"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(1); }}
                className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-all opacity-60 hover:opacity-100"
                aria-label="التالي"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Dot indicators — overlapping bottom of image */}
          {items.length > 1 && (
            <div className="absolute bottom-3 md:bottom-5 inset-x-0 z-20 flex justify-center gap-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); jump(i); }}
                  aria-label={`الشريحة ${i + 1}`}
                  className={`rounded-full transition-all duration-400 ${
                    i === active
                      ? "w-6 h-2.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                      : "w-2.5 h-2.5 bg-white/40 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

function FeaturedSection() {
  const [items, setItems] = useState<FeaturedManga[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manga/featured")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="py-12 container px-4 md:px-6">
      <div className="flex items-center gap-3 mb-7">
        <Star className="h-6 w-6 text-primary fill-primary" />
        <h2 className="text-2xl font-bold tracking-tight">أعمال جديدة</h2>
      </div>
      {loading ? (
        <div className="flex gap-5 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-32 aspect-[2/3] rounded-lg flex-shrink-0" />)}
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-2">
          {items.map((manga) => (
            <Link key={manga.id} href={`/manga/${manga.id}`} className="flex-shrink-0 group">
              <div className="w-32 md:w-40">
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 bg-secondary/30 shadow-md hover:shadow-xl transition-shadow">
                  <img
                    src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text="}
                    alt={manga.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-1.5 right-1.5 bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                    جديد
                  </div>
                </div>
                <p className="text-xs font-bold line-clamp-2 group-hover:text-primary transition-colors">{manga.title}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetMangaStats();
  const { data: updates, isLoading: updatesLoading } = useGetLatestUpdates();

  return (
    <div className="flex-1 w-full pb-12">
      {/* Hero */}
      <section className="relative w-full h-[50vh] min-h-[360px] flex items-center justify-center overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/75 to-background/20" />
        <div className="absolute inset-0 -z-10 bg-[url('https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 blur-sm" />
        <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center gap-5">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-foreground drop-shadow-md">
            اكتشف عوالم <span className="text-primary">جديدة</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-[560px]">
            منصة القراءة الرائدة للقصص المصورة والمانهوا العربية.
          </p>
          <Link href="/manga">
            <Button size="lg" className="px-8 rounded-full h-12 text-md mt-2">تصفح المكتبة</Button>
          </Link>
        </div>
      </section>

      {/* 🔥 Trending — TOP of list */}
      <section className="py-12 container px-4 md:px-6">
        <div className="flex items-center gap-3 mb-7">
          <Flame className="h-7 w-7 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">الأكثر رائجاً</h2>
        </div>
        <TrendingCarousel />
      </section>

      {/* Stats */}
      <section className="py-8 bg-secondary/20">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            ) : (
              <>
                <div className="flex flex-col gap-1"><h3 className="text-3xl font-bold text-primary">{stats?.totalManga || 0}</h3><p className="text-sm text-muted-foreground">أعمال</p></div>
                <div className="flex flex-col gap-1"><h3 className="text-3xl font-bold text-primary">{stats?.totalChapters || 0}</h3><p className="text-sm text-muted-foreground">فصل</p></div>
                <div className="flex flex-col gap-1"><h3 className="text-3xl font-bold text-primary">{stats?.totalPages || 0}</h3><p className="text-sm text-muted-foreground">صفحة</p></div>
                <div className="flex flex-col gap-1"><h3 className="text-3xl font-bold text-primary">{stats?.publishedChapters || 0}</h3><p className="text-sm text-muted-foreground">فصل منشور</p></div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ⭐ Featured */}
      <FeaturedSection />

      {/* Latest Updates */}
      <section className="py-8 container px-4 md:px-6">
        <div className="flex items-center justify-between mb-7">
          <h2 className="text-2xl font-bold tracking-tight">أحدث الإضافات</h2>
          <Link href="/manga" className="text-sm font-medium text-primary hover:underline">عرض الكل</Link>
        </div>
        {updatesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {updates?.map((manga) => (
              <Link key={manga.id} href={`/manga/${manga.id}`}>
                <Card className="group overflow-hidden border-transparent bg-transparent hover:bg-secondary/40 transition-colors rounded-xl cursor-pointer flex flex-col h-full">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl mb-2">
                    <img
                      src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text="}
                      alt={manga.title}
                      className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                      <span className="bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                        <MangaTypeLabel type={manga.type} />
                      </span>
                    </div>
                  </div>
                  <CardContent className="p-0 flex-1 flex flex-col px-1">
                    <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">{manga.title}</h3>
                    {manga.latestChapterNumber && (
                      <p className="text-xs text-muted-foreground mt-auto">الفصل {manga.latestChapterNumber}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
