import { useParams, Link, useLocation } from "wouter";
import { useGetChapter, useListChapters, getGetChapterQueryKey } from "@workspace/api-client-react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useAuth } from "@/hooks/use-auth";
import { useXpToast } from "@/contexts/xp-toast-context";
import { useUserProfile } from "@/contexts/user-profile-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ArrowRight, ArrowLeft, BookOpen, CheckCircle, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
  const { isSignedIn } = useClerkAuth();
  const { publisherToken } = useAuth();
  const { showXpToast } = useXpToast();
  const { updateXp } = useUserProfile();
  const queryClient = useQueryClient();

  const { data: chapter, isLoading: chapterLoading } = useGetChapter(id, chapterId);
  const { data: allChapters, isLoading: chaptersLoading } = useListChapters(id);

  const sortedChapters = allChapters?.sort((a, b) => a.number - b.number) || [];
  const currentIndex = sortedChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  // ── Publisher modals ────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const handleDeleteChapter = async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/manga/${id}/chapters/${chapterId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${publisherToken}` },
      });
      if (r.ok || r.status === 204) {
        setDeleteOpen(false);
        setLocation(`/manga/${id}`);
      }
    } catch {}
    setDeleting(false);
  };

  const openEditChapter = () => {
    setEditTitle(chapter?.title ?? "");
    setEditNumber(String(chapter?.number ?? ""));
    setEditOpen(true);
  };

  const handleEditChapter = async () => {
    setEditSaving(true);
    try {
      const r = await fetch(`/api/manga/${id}/chapters/${chapterId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publisherToken}`,
        },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          number: parseInt(editNumber, 10),
        }),
      });
      if (r.ok) {
        queryClient.invalidateQueries({ queryKey: getGetChapterQueryKey(id, chapterId) });
        setEditOpen(false);
      }
    } catch {}
    setEditSaving(false);
  };

  // ── Last page detection ─────────────────────────────────────────────────────
  const [lastPageSeen, setLastPageSeen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const attachLastPageObserver = useCallback((el: HTMLImageElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setLastPageSeen(true); },
      { threshold: 0.3 }
    );
    observerRef.current.observe(el);
  }, []);

  useEffect(() => {
    setLastPageSeen(false);
    return () => { observerRef.current?.disconnect(); };
  }, [chapterId]);

  // ── Award XP on chapter completion ─────────────────────────────────────────
  const awardChapterXp = useCallback(async () => {
    if (!isSignedIn || !lastPageSeen) return;
    try {
      const r = await fetch(`/api/xp/chapter-complete/${id}/${chapterId}`, { method: "POST" });
      const data = await r.json();
      if (data.awarded) {
        showXpToast(20);
        updateXp(data.currentXp, data.level);
      }
    } catch {}
  }, [isSignedIn, lastPageSeen, id, chapterId, showXpToast, updateXp]);

  // ── Immersive mode ──────────────────────────────────────────────────────────
  const [barsVisible, setBarsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBarsVisible(false), 3000);
  }, []);

  const handleScreenTap = useCallback(() => {
    setBarsVisible(prev => {
      const next = !prev;
      if (next) resetTimer();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
      return next;
    });
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetTimer]);

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && nextChapter) {
        await awardChapterXp();
        setLocation(`/manga/${id}/chapter/${nextChapter.id}`);
      } else if (e.key === "ArrowRight" && prevChapter) {
        setLocation(`/manga/${id}/chapter/${prevChapter.id}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChapter, prevChapter, id, setLocation, awardChapterXp]);

  // ── Side effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || isNaN(id)) return;
    const key = `viewed_${id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch(`/api/manga/${id}/view`, { method: "POST" }).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    if (!id || !chapterId || isNaN(id) || isNaN(chapterId)) return;
    markChapterRead(id, chapterId);
    if (isSignedIn) {
      fetch(`/api/progress/${id}/${chapterId}`, { method: "POST" }).catch(() => {});
    }
  }, [id, chapterId, isSignedIn]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (chapterLoading || chaptersLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center py-12">
        <Skeleton className="h-8 w-64 mb-12" />
        <div className="space-y-4 w-full max-w-3xl px-4">
          <Skeleton className="h-[800px] w-full" />
        </div>
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

  const barClass = `transition-all duration-300 ease-in-out ${
    barsVisible ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none"
  }`;

  const sortedPages = chapter.pages
    ? [...chapter.pages].sort((a, b) => a.pageNumber - b.pageNumber)
    : [];
  const lastPage = sortedPages[sortedPages.length - 1];

  return (
    <div className="min-h-screen bg-background text-foreground select-none" onClick={handleScreenTap}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur border-b border-border p-3 flex items-center justify-between gap-2 ${barClass}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/manga/${id}`}>
            <Button variant="ghost" size="icon" className="hover:bg-secondary shrink-0">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-sm md:text-base line-clamp-1">
              {chapter.manga?.title || "جار التحميل..."}
            </h1>
            <p className="text-xs text-muted-foreground">
              الفصل {chapter.number}{chapter.title ? ` - ${chapter.title}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Publisher controls */}
          {publisherToken && (
            <>
              <Button
                variant="ghost" size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="تعديل الفصل"
                onClick={openEditChapter}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="حذف الفصل"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}

          <Link
            href={prevChapter ? `/manga/${id}/chapter/${prevChapter.id}` : "#"}
            className={!prevChapter ? "pointer-events-none opacity-40" : ""}
          >
            <Button variant="outline" size="sm">
              <ArrowRight className="h-4 w-4 ml-1.5" />السابق
            </Button>
          </Link>
          {nextChapter ? (
            <Link href={`/manga/${id}/chapter/${nextChapter.id}`}>
              <Button
                variant="outline" size="sm"
                className="border-primary/50 hover:bg-primary/10 text-primary"
                onClick={awardChapterXp}
              >
                التالي<ArrowLeft className="h-4 w-4 mr-1.5" />
              </Button>
            </Link>
          ) : (
            <Link href={`/manga/${id}`}>
              <Button
                variant="outline" size="sm"
                className="border-primary/50 hover:bg-primary/10 text-primary"
                onClick={awardChapterXp}
              >
                <CheckCircle className="h-4 w-4 ml-1.5" />إنهاء
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Pages ───────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto w-full flex flex-col items-center pt-[64px] pb-[88px]">
        {sortedPages.length > 0 ? (
          <div className="w-full flex flex-col">
            {sortedPages.map((page, idx) => {
              const isLast = lastPage && page.id === lastPage.id;
              return (
                <img
                  key={page.id}
                  ref={isLast ? attachLastPageObserver : undefined}
                  src={page.imageUrl}
                  alt={`صفحة ${page.pageNumber}`}
                  className="w-full object-contain block"
                  loading={idx < 3 ? "eager" : "lazy"}
                />
              );
            })}
          </div>
        ) : (
          <div className="py-32 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>لا توجد صفحات في هذا الفصل</p>
          </div>
        )}
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur border-t border-border px-6 py-3 flex justify-between items-center ${barClass} ${!barsVisible ? "translate-y-full" : "translate-y-0"}`}
        onClick={e => e.stopPropagation()}
      >
        <Link
          href={prevChapter ? `/manga/${id}/chapter/${prevChapter.id}` : "#"}
          className={!prevChapter ? "pointer-events-none opacity-40" : ""}
        >
          <Button variant="outline" size="lg" className="w-28">
            <ArrowRight className="h-5 w-5 ml-2" />السابق
          </Button>
        </Link>

        <span className="text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} / {sortedChapters.length}
        </span>

        {nextChapter ? (
          <Link href={`/manga/${id}/chapter/${nextChapter.id}`}>
            <Button
              variant="outline" size="lg"
              className="w-28 border-primary/50 hover:bg-primary/10 text-primary"
              onClick={awardChapterXp}
            >
              التالي<ArrowLeft className="h-5 w-5 mr-2" />
            </Button>
          </Link>
        ) : (
          <Link href={`/manga/${id}`}>
            <Button
              variant="outline" size="lg"
              className="w-36 border-primary/50 hover:bg-primary/10 text-primary"
              onClick={awardChapterXp}
            >
              <CheckCircle className="h-5 w-5 ml-2" />إنهاء الفصل
            </Button>
          </Link>
        )}
      </div>

      {/* ── Delete Chapter Modal ───────────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteOpen(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base">حذف الفصل</h3>
                <p className="text-sm text-muted-foreground">الفصل {chapter.number}{chapter.title ? ` - ${chapter.title}` : ""}</p>
              </div>
              <button onClick={() => setDeleteOpen(false)} className="mr-auto text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا الفصل؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeleteChapter} disabled={deleting}>
                {deleting ? "جار الحذف..." : "حذف الفصل"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Chapter Modal ─────────────────────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">تعديل الفصل</h3>
              <button onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <Label>رقم الفصل</Label>
              <Input
                type="number"
                min="1"
                value={editNumber}
                onChange={e => setEditNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>عنوان الفصل (اختياري)</Label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="عنوان الفصل"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button onClick={handleEditChapter} disabled={editSaving || !editNumber}>
                {editSaving ? "جار الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
