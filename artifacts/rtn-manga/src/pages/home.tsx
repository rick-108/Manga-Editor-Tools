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
    timerRef.current = setInterval(() => setActive((p) => (p + 1) % items.length), 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  const go = (dir: 1 | -1) => {
    setActive((p) => (p + dir + items.length) % items.length);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (loading) {
    return (
      <div className="w-full h-[65vh] min-h-[480px] rounded-2xl bg-secondary/30 animate-pulse flex items-center justify-center">
        <Flame className="h-12 w-12 text-muted-foreground/30" />
      </div>
    );
  }
  if (items.length === 0) return null;

  const current = items[active];
  const cover = current.coverImage || "https://placehold.co/600x900/1a1a1a/666?text=";

  return (
    <div className="relative w-full">
      {/* Main card */}
      <div className="relative w-full h-[70vh] min-h-[500px] rounded-2xl overflow-hidden shadow-2xl">
        {/* Blurred BG */}
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 blur-lg brightness-40 transition-all duration-700"
          style={{ backgroundImage: `url(${cover})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        {/* Rank badge */}
        <div className="absolute top-5 right-5 z-10 flex items-center gap-2 bg-primary/90 backdrop-blur px-4 py-1.5 rounded-full shadow-lg">
          <Flame className="h-4 w-4 text-white" />
          <span className="text-white font-bold text-sm">الأكثر رائجاً</span>
          <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">#{active + 1}</span>
        </div>

        {/* Center: cover image */}
        <div className="absolute inset-0 flex items-center justify-center pt-4">
          <Link href={`/manga/${current.id}`}>
            <div className="relative w-44 md:w-64 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] ring-2 ring-white/10 hover:ring-primary/60 transition-all duration-300 hover:scale-[1.03]">
              <img src={cover} alt={current.title} className="w-full h-full object-cover" />
            </div>
          </Link>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 inset-x-0 p-6 md:p-8 text-center">
          <Link href={`/manga/${current.id}`}>
            <h3 className="text-2xl md:text-4xl font-bold text-white drop-shadow-lg hover:text-primary transition-colors line-clamp-2 mb-2">
              {current.title}
            </h3>
          </Link>
          <span className="inline-block bg-white/10 backdrop-blur text-white/80 text-sm px-3 py-1 rounded-full">
            <MangaTypeLabel type={current.type} />
          </span>
        </div>

        {/* Side arrows */}
        {items.length > 1 && (
          <>
            <button onClick={() => go(1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-background/70 hover:bg-primary text-foreground hover:text-white rounded-full p-3 transition-all backdrop-blur shadow-lg">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={() => go(-1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-background/70 hover:bg-primary text-foreground hover:text-white rounded-full p-3 transition-all backdrop-blur shadow-lg">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails strip */}
      <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1 justify-center">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => { setActive(i); if (timerRef.current) clearInterval(timerRef.current); }}
            className={`flex-shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden ring-2 transition-all duration-200 ${i === active ? "ring-primary scale-110 shadow-lg" : "ring-transparent opacity-40 hover:opacity-70"}`}
          >
            <img src={item.coverImage || "https://placehold.co/100x150/1a1a1a/666?text="} alt={item.title} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-3">
        {items.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-8 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground"}`} />
        ))}
      </div>
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
