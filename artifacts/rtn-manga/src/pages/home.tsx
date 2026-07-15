import { useGetLatestUpdates, useGetMangaStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetMangaStats();
  const { data: updates, isLoading: updatesLoading } = useGetLatestUpdates();

  return (
    <div className="flex-1 w-full pb-12">
      {/* Hero */}
      <section className="relative w-full h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
        <div className="absolute inset-0 -z-10 bg-[url('https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 blur-sm" />
        
        <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center gap-6">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-white drop-shadow-md">
            اكتشف عوالم <span className="text-primary">جديدة</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-[600px]">
            منصة القراءة الرائدة للقصص المصورة والمانهوا العربية.
            تجربة قراءة سينمائية سلسة وممتعة.
          </p>
          <div className="flex gap-4 mt-4">
            <Link href="/manga">
              <Button size="lg" className="text-md px-8 rounded-full h-12">
                تصفح الفهرس
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-secondary/20">
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

      {/* Latest Updates */}
      <section className="py-16 container px-4 md:px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold tracking-tight">أحدث الفصول</h2>
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
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <span className="bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                        {manga.type === 'manhwa' ? 'مانهوا' : manga.type === 'manhua' ? 'مانهوا صينية' : 'مانغا'}
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
