import { useParams, Link } from "wouter";
import { useGetManga, useListChapters, useGetMangaComments, useAddMangaComment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMangaCommentsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { BookMarked, Check, CheckCircle2 } from "lucide-react";

function useReadChapters(mangaId: number) {
  const [readSet, setReadSet] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`read_${mangaId}`) || "[]") as number[];
      setReadSet(new Set(stored));
    } catch {}
    // Listen for storage changes (cross-tab or from reader page)
    const onStorage = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(`read_${mangaId}`) || "[]") as number[];
        setReadSet(new Set(stored));
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mangaId]);
  return readSet;
}

export default function MangaDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user, token } = useAuth();
  const queryClient = useQueryClient();

  const { data: manga, isLoading: mangaLoading } = useGetManga(id);
  const { data: chapters, isLoading: chaptersLoading } = useListChapters(id);
  const { data: comments, isLoading: commentsLoading } = useGetMangaComments(id);
  const readChapters = useReadChapters(id);

  const addComment = useAddMangaComment();
  const [commentContent, setCommentContent] = useState("");

  // Library state
  const [inLibrary, setInLibrary] = useState(false);
  const [libLoading, setLibLoading] = useState(false);
  const [libChecked, setLibChecked] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    fetch(`/api/library/${id}/check`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setInLibrary(!!d.saved); setLibChecked(true); })
      .catch(() => { setLibChecked(true); });
  }, [token, id]);

  const toggleLibrary = async () => {
    if (!token) return;
    setLibLoading(true);
    const method = inLibrary ? "DELETE" : "POST";
    try {
      const r = await fetch(`/api/library/${id}`, { method, headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setInLibrary(!!d.saved);
    } catch {}
    setLibLoading(false);
  };

  const handleAddComment = () => {
    if (!commentContent.trim() || !user) return;
    addComment.mutate(
      { mangaId: id, data: { content: commentContent } },
      { onSuccess: () => { setCommentContent(""); queryClient.invalidateQueries({ queryKey: getGetMangaCommentsQueryKey(id) }); } }
    );
  };

  if (mangaLoading) {
    return (
      <div className="container py-8 max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row gap-8">
          <Skeleton className="w-full md:w-[300px] aspect-[2/3] rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-4 mt-4 md:mt-0">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-32 w-full mt-6" />
          </div>
        </div>
      </div>
    );
  }

  if (!manga) return <div className="text-center py-24">العمل غير موجود</div>;

  const typeLabel = manga.type === "manga" ? "مانغا" : "مانهوا";

  return (
    <div className="w-full pb-24">
      {/* Backdrop */}
      <div className="relative w-full h-[40vh] min-h-[300px] overflow-hidden">
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-30 blur-xl scale-110"
          style={{ backgroundImage: `url(${manga.coverImage || ""})` }}
        />
      </div>

      <div className="container max-w-6xl mx-auto px-4 -mt-[20vh] relative z-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Cover */}
          <div className="w-48 md:w-[300px] flex-shrink-0 mx-auto md:mx-0 shadow-2xl rounded-xl overflow-hidden border border-border/50 bg-secondary">
            <img
              src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"}
              alt={manga.title}
              className="w-full h-auto object-cover aspect-[2/3]"
            />
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col pt-4 md:pt-16">
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30">{typeLabel}</Badge>
              <Badge variant="outline">
                {manga.status === "ongoing" ? "مستمر" : manga.status === "completed" ? "مكتمل" : "متوقف"}
              </Badge>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{manga.title}</h1>

            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed mb-6">
              {manga.description || "لا يوجد وصف."}
            </div>

            {manga.genres && manga.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {manga.genres.map((g) => (
                  <span key={g} className="text-xs font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">{g}</span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {chapters && chapters.length > 0 && (
                <Link href={`/manga/${manga.id}/chapter/${chapters[0].id}`}>
                  <Button size="lg" className="px-8 rounded-full h-12 text-md shadow-[0_0_20px_rgba(225,29,72,0.3)]">
                    قراءة الفصل الأول
                  </Button>
                </Link>
              )}

              {/* Library button — only for logged-in users */}
              {user && libChecked && (
                <Button
                  size="lg"
                  variant={inLibrary ? "secondary" : "outline"}
                  className={`rounded-full h-12 px-6 gap-2 transition-all ${inLibrary ? "border-primary/40" : ""}`}
                  onClick={toggleLibrary}
                  disabled={libLoading}
                >
                  {inLibrary ? (
                    <><Check className="h-4 w-4 text-primary" /><span>في مكتبتي</span></>
                  ) : (
                    <><BookMarked className="h-4 w-4" /><span>أضف للمكتبة</span></>
                  )}
                </Button>
              )}

              {!user && (
                <Link href="/login">
                  <Button size="lg" variant="outline" className="rounded-full h-12 px-6 gap-2">
                    <BookMarked className="h-4 w-4" />
                    أضف للمكتبة
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Chapters + Comments */}
        <div className="mt-16 md:mt-24 grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <h2 className="text-2xl font-bold">الفصول</h2>
              <span className="text-muted-foreground">{chapters?.length || 0} فصل</span>
            </div>

            {chaptersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : chapters?.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-border/50">لا توجد فصول بعد.</div>
            ) : (
              <div className="grid gap-2.5">
                {chapters?.map((chapter) => {
                  const isRead = readChapters.has(chapter.id);
                  return (
                    <Link key={chapter.id} href={`/manga/${manga.id}/chapter/${chapter.id}`}>
                      <div className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                        isRead
                          ? "bg-secondary/10 border-border/30 opacity-60 hover:opacity-100 hover:bg-secondary/40 hover:border-border/60"
                          : "bg-secondary/30 hover:bg-secondary border-border/50 hover:border-primary/50"
                      }`}>
                        <div className="flex items-center gap-3">
                          {isRead && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-bold text-base transition-colors ${isRead ? "line-through decoration-muted-foreground/40" : "group-hover:text-primary"}`}>
                              الفصل {chapter.number}{chapter.title ? ` - ${chapter.title}` : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {chapter.createdAt ? format(new Date(chapter.createdAt), "yyyy/MM/dd") : ""}
                              {isRead && <span className="mr-2 text-primary/80 font-medium">• تمت القراءة</span>}
                            </span>
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
                          isRead
                            ? "bg-primary/10 text-primary"
                            : "bg-transparent text-muted-foreground opacity-0 group-hover:opacity-100"
                        }`}>
                          {isRead ? "إعادة قراءة" : "قراءة"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold border-b border-border/50 pb-4">التعليقات</h2>
            {user ? (
              <div className="space-y-3 bg-secondary/20 p-4 rounded-xl border border-border/50">
                <Textarea
                  placeholder="أضف تعليقاً..."
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  className="bg-background resize-none h-24"
                />
                <Button onClick={handleAddComment} disabled={!commentContent.trim() || addComment.isPending} className="w-full">
                  إرسال التعليق
                </Button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-border/50 bg-secondary/20 text-center">
                <p className="text-sm text-muted-foreground mb-4">يجب تسجيل الدخول لإضافة تعليق.</p>
                <Link href="/login"><Button variant="outline" size="sm">تسجيل الدخول</Button></Link>
              </div>
            )}

            <div className="space-y-4 mt-6">
              {commentsLoading ? (
                <Skeleton className="h-24 w-full rounded-lg" />
              ) : comments?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد تعليقات بعد.</p>
              ) : (
                comments?.map((comment) => (
                  <div key={comment.id} className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0 overflow-hidden">
                        {comment.user?.avatar ? (
                          <img src={comment.user.avatar} alt={comment.user.username} className="w-full h-full object-cover" />
                        ) : (
                          comment.user?.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{comment.user?.username}</span>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(comment.createdAt), "yyyy/MM/dd HH:mm")}</span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90 pl-10 pr-2">{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
