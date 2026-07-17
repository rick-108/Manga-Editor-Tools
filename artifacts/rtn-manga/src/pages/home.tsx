import { useGetLatestUpdates, useGetMangaStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState, useRef } from "react";
import { ChevronRight, ChevronLeft, Flame } from "lucide-react";

type TrendingManga = {
  id: number;
  title: string;
  coverImage: string | null;
  type: string;
  viewCount: number;
};

function TrendingCarousel() {
  const [items, setItems] = useState<TrendingManga[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/manga/trending?limit=8")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setItems(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-advance
  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % items.length);
    }, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  const prev = () => {
    setActive((p) => (p - 1 + items.length) % items.length);
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const next = () => {
    setActive((p) => (p + 1) % items.length);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="w-full aspect-[2/3] rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  const current = items[active];

  return (
    <div className="relative">
      {/* Main spotlight */}
      <div className="relative w-full h-[55vh] min-h-[360px] rounded-2xl overflow-hidden mb-6 shadow-2xl">
        <img
          key={current.id}
          src={current.coverImage || "https://placehold.co/800x1200/1a1a1a/666?text=No+Cover"}
          alt={current.title}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-700 scale-110 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Center cover */}
        <div className="absolute inset-0 flex items-center justify-center gap-8">
          <Link href={`/manga/${current.id}`}>
            <div className="relative w-40 md:w-52 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-2 ring-primary/50 hover:ring-primary transition-all duration-300 hover:scale-105">
              <img
                src={current.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"}
                alt={current.title}
                className="w-full h-full object-cover"
              />
            </div>
          </Link>
        </div>

        {/* Title + meta */}
        <div className="absolute bottom-0 inset-x-0 p-6 text-center">
          <Link href={`/manga/${current.id}`}>
            <h3 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg hover:text-primary transition-colors line-clamp-1">
              {current.title}
            </h3>
          </Link>
          <p className="text-sm text-zinc-400 mt-1">
            {current.type === "manhwa" ? "مانهوا" : current.type === "manhua" ? "مانهوا" : "مانغا"} •{" "}
            <span className="text-primary font-bold">{current.viewCount.toLocaleString("ar-EG")}</span> مشاهدة
          </p>
        </div>

        {/* Nav arrows */}
        {items.length > 1 && (
          <>
            <button
              onClick={next}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/70 hover:bg-primary text-foreground hover:text-white rounded-full p-2 transition-all backdrop-blur"
              aria-label="التالي"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={prev}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/70 hover:bg-primary text-foreground hover:text-white rounded-full p-2 transition-all backdrop-blur"
              aria-label="السابق"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide justify-center">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setActive(i)}
            className={`flex-shrink-0 w-16 aspect-[2/3] rounded-lg overflow-hidden ring-2 transition-all duration-200 ${
              i === active ? "ring-primary scale-105" : "ring-transparent opacity-50 hover:opacity-80"
            }`}
          >
            <img
              src={item.coverImage || "https://placehold.co/100x150/1a1a1a/666?text="}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 mt-4">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function MangaTypeLabel({ type }: { type: string }) {
  if (type === "manga") return "مانغا";
  return "مانهوا";
}

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetMangaStats();
  const { data: updates, isLoading: updatesLoading } = useGetLatestUpdates();

  return (
    <div className="flex-1 w-full pb-12">
      {/* Hero */}
      <section className="relative w-full h-[58vh] min-h-[420px] flex items-center justify-center overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/75 to-background/20" />
        <div className="absolute inset-0 -z-10 bg-[url('https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 blur-sm" />

        <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center gap-6">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-foreground drop-shadow-md">
            اكتشف عوالم <span className="text-primary">جديدة</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-[600px]">
            منصة القراءة الرائدة للقصص المصورة والمانهوا العربية.
            تجربة قراءة سينمائية سلسة وممتعة.
          </p>
          <div className="flex gap-4 mt-4">
            <Link href="/manga">
              <Button size="lg" className="text-md px-8 rounded-full h-12">
                تصفح المكتبة
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-10 bg-secondary/20">
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
                <div className="flex flex-col gap-1">
                  <h3 className="text-3xl font-bold text-primary">{stats?.totalManga || 0}</h3>
                  <p className="text-sm text-muted-foreground">أعمال</p>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-3xl font-bold text-primary">{stats?.totalChapters || 0}</h3>
                  <p className="text-sm text-muted-foreground">فصل</p>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-3xl font-bold text-primary">{stats?.totalPages || 0}</h3>
                  <p className="text-sm text-muted-foreground">صفحة</p>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-3xl font-bold text-primary">{stats?.publishedChapters || 0}</h3>
                  <p className="text-sm text-muted-foreground">فصل منشور</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Trending */}
      <section className="py-16 container px-4 md:px-6">
        <div className="flex items-center gap-3 mb-8">
          <Flame className="h-7 w-7 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">الأكثر رائجاً</h2>
        </div>
        <TrendingCarousel />
      </section>

      {/* Latest Updates */}
      <section className="py-8 container px-4 md:px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold tracking-tight">أحدث الإضافات</h2>
          <Link href="/manga" className="text-sm font-medium text-primary hover:underline">
            عرض الكل
          </Link>
        </div>

        {updatesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {updates?.map((manga) => (
              <Link key={manga.id} href={`/manga/${manga.id}`}>
                <Card className="group overflow-hidden border-transparent bg-transparent hover:bg-secondary/40 transition-colors rounded-lg cursor-pointer flex flex-col h-full">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg mb-3">
                    <img
                      src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"}
                      alt={manga.title}
                      className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                      <span className="bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                        <MangaTypeLabel type={manga.type} />
                      </span>
                    </div>
                  </div>
                  <CardContent className="p-0 flex-1 flex flex-col">
                    <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">
                      {manga.title}
                    </h3>
                    <div className="mt-auto">
                      {manga.latestChapterNumber && (
                        <p className="text-xs text-muted-foreground font-medium">
                          الفصل {manga.latestChapterNumber}
                        </p>
                      )}
                    </div>
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
