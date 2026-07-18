import { useParams, Link, useLocation } from "wouter";
import { useGetChapter, useListChapters } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ArrowRight, ArrowLeft, BookOpen } from "lucide-react";
import { useEffect } from "react";

function markChapterRead(mangaId: number, chapterId: number) {
  try {
    const key = `read_${mangaId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as number[];
    if (!existing.includes(chapterId)) {
      existing.push(chapterId);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch {}
}

export default function Reader() {
  const params = useParams<{ id: string; chapterId: string }>();
  const id = Number(params.id);
  const chapterId = Number(params.chapterId);
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();

  const { data: chapter, isLoading: chapterLoading } = useGetChapter(id, chapterId);
  const { data: allChapters, isLoading: chaptersLoading } = useListChapters(id);

  const sortedChapters = allChapters?.sort((a, b) => a.number - b.number) || [];
  const currentIndex = sortedChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  // Track view (once per manga per session)
  useEffect(() => {
    if (!id || isNaN(id)) return;
    const key = `viewed_${id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch(`/api/manga/${id}/view`, { method: "POST" }).catch(() => {});
    }
  }, [id]);

  // Mark as read + save progress (Clerk cookie — no Bearer header needed)
  useEffect(() => {
    if (!id || !chapterId || isNaN(id) || isNaN(chapterId)) return;
    markChapterRead(id, chapterId);
    if (isSignedIn) {
      fetch(`/api/progress/${id}/${chapterId}`, { method: "POST" }).catch(() => {});
    }
  }, [id, chapterId, isSignedIn]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && nextChapter) setLocation(`/manga/${id}/chapter/${nextChapter.id}`);
      else if (e.key === "ArrowRight" && prevChapter) setLocation(`/manga/${id}/chapter/${prevChapter.id}`);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChapter, prevChapter, id, setLocation]);

  if (chapterLoading || chaptersLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center py-12">
        <Skeleton className="h-8 w-64 mb-12" />
        <div className="space-y-4 w-full max-w-3xl px-4"><Skeleton className="h-[800px] w-full" /></div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl">الفصل غير موجود</p>
          <Link href={`/manga/${id}`}><Button variant="outline">العودة للعمل</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Top Nav */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/manga/${id}`}>
            <Button variant="ghost" size="icon" className="hover:bg-secondary">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-sm md:text-base line-clamp-1">{chapter.manga?.title || "جار التحميل..."}</h1>
            <p className="text-xs text-muted-foreground">الفصل {chapter.number}{chapter.title ? ` - ${chapter.title}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={prevChapter ? `/manga/${id}/chapter/${prevChapter.id}` : "#"} className={!prevChapter ? "pointer-events-none opacity-40" : ""}>
            <Button variant="outline" size="sm"><ArrowRight className="h-4 w-4 ml-1.5" />السابق</Button>
          </Link>
          <Link href={nextChapter ? `/manga/${id}/chapter/${nextChapter.id}` : "#"} className={!nextChapter ? "pointer-events-none opacity-40" : ""}>
            <Button variant="outline" size="sm" className="border-primary/50 hover:bg-primary/10 text-primary">التالي<ArrowLeft className="h-4 w-4 mr-1.5" /></Button>
          </Link>
        </div>
      </div>

      {/* Pages */}
      <div className="max-w-4xl mx-auto w-full flex flex-col items-center mt-4">
        {chapter.pages && chapter.pages.length > 0 ? (
          <div className="w-full flex flex-col">
            {chapter.pages.sort((a, b) => a.pageNumber - b.pageNumber).map((page) => (
              <img key={page.id} src={page.imageUrl} alt={`صفحة ${page.pageNumber}`} className="w-full object-contain block" loading="lazy" />
            ))}
          </div>
        ) : (
          <div className="py-32 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>لا توجد صفحات في هذا الفصل</p>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="max-w-xl mx-auto mt-16 px-4 flex justify-between items-center">
        <Link href={prevChapter ? `/manga/${id}/chapter/${prevChapter.id}` : "#"} className={!prevChapter ? "pointer-events-none opacity-40" : ""}>
          <Button variant="outline" size="lg" className="w-32"><ArrowRight className="h-5 w-5 ml-2" />السابق</Button>
        </Link>
        <Link href={`/manga/${id}`}><Button variant="ghost">فهرس الفصول</Button></Link>
        <Link href={nextChapter ? `/manga/${id}/chapter/${nextChapter.id}` : "#"} className={!nextChapter ? "pointer-events-none opacity-40" : ""}>
          <Button variant="outline" size="lg" className="w-32 border-primary/50 hover:bg-primary/10 text-primary">التالي<ArrowLeft className="h-5 w-5 mr-2" /></Button>
        </Link>
      </div>
    </div>
  );
}
