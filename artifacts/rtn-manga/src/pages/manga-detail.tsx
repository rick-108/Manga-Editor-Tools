import { useParams, Link, useLocation } from "wouter";
import { useGetManga, useListChapters, useGetMangaComments, useAddMangaComment, getGetMangaCommentsQueryKey, getListChaptersQueryKey, getGetMangaQueryKey } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useAuth } from "@/hooks/use-auth";
import { useXpToast } from "@/contexts/xp-toast-context";
import { useUserProfile } from "@/contexts/user-profile-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  BookMarked, Check, CheckCircle2, Pencil, Trash2, X, Upload, AlertTriangle,
} from "lucide-react";

function useReadChapters(mangaId: number) {
  const [readSet, setReadSet] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`read_${mangaId}`) || "[]") as number[];
      setReadSet(new Set(stored));
    } catch {}
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
  const { user } = useUser();
  const { publisherToken } = useAuth();
  const { showXpToast } = useXpToast();
  const { updateXp } = useUserProfile();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: manga, isLoading: mangaLoading } = useGetManga(id);
  const { data: chapters, isLoading: chaptersLoading } = useListChapters(id);
  const { data: comments, isLoading: commentsLoading } = useGetMangaComments(id);
  const addComment = useAddMangaComment();
  const [commentContent, setCommentContent] = useState("");
  const readChapters = useReadChapters(id);

  // Library state
  const [inLibrary, setInLibrary] = useState(false);
  const [libLoading, setLibLoading] = useState(false);
  const [libChecked, setLibChecked] = useState(false);

  // Publisher modals
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editGenres, setEditGenres] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !id) return;
    fetch(`/api/library/${id}/check`)
      .then((r) => r.json())
      .then((d) => { setInLibrary(!!d.saved); setLibChecked(true); })
      .catch(() => { setLibChecked(true); });
  }, [user, id]);

  const toggleLibrary = async () => {
    if (!user) return;
    setLibLoading(true);
    try {
      const r = await fetch(`/api/library/${id}`, { method: inLibrary ? "DELETE" : "POST" });
      const d = await r.json();
      setInLibrary(!!d.saved);
    } catch {}
    setLibLoading(false);
  };

  const handleAddComment = () => {
    if (!commentContent.trim() || !user) return;
    addComment.mutate(
      { mangaId: id, data: { content: commentContent } },
      {
        onSuccess: (data: any) => {
          setCommentContent("");
          queryClient.invalidateQueries({ queryKey: getGetMangaCommentsQueryKey(id) });
          // Real-time XP update
          if (data?.xpAwarded) {
            showXpToast(10);
            updateXp(data.xpCurrentXp, data.xpLevel);
          }
        }
      }
    );
  };

  // ── Publisher: Delete Manga ──────────────────────────────────────────────
  const openEdit = () => {
    if (!manga) return;
    setEditTitle(manga.title ?? "");
    setEditDesc((manga as any).description ?? "");
    setEditStatus(manga.status ?? "ongoing");
    setEditGenres(Array.isArray((manga as any).genres) ? (manga as any).genres.join(", ") : "");
    setEditCoverUrl((manga as any).coverImage ?? "");
    setEditCoverFile(null);
    setEditOpen(true);
  };

  const handleDeleteManga = async () => {
    if (deleteCode !== "rtn_publisher_2024") {
      setDeleteError("رمز التحقق غير صحيح");
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch(`/api/manga/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${publisherToken}` },
      });
      if (r.ok || r.status === 204) {
        setDeleteOpen(false);
        setLocation("/manga");
      } else {
        setDeleteError("فشل الحذف");
      }
    } catch {
      setDeleteError("خطأ في الشبكة");
    } finally {
      setDeleting(false);
    }
  };

  const handleEditManga = async () => {
    setEditSaving(true);
    try {
      let coverImage = editCoverUrl;

      // Upload new cover if a file was selected
      if (editCoverFile) {
        const form = new FormData();
        form.append("cover", editCoverFile);
        const r = await fetch(`/api/manga/${id}/cover`, {
          method: "POST",
          headers: { Authorization: `Bearer ${publisherToken}` },
          body: form,
        });
        const d = await r.json();
        if (r.ok && d.coverImage) coverImage = d.coverImage;
      }

      const genres = editGenres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const r = await fetch(`/api/manga/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publisherToken}`,
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          status: editStatus,
          genres,
          coverImage: coverImage || undefined,
        }),
      });
      if (r.ok) {
        queryClient.invalidateQueries({ queryKey: getGetMangaQueryKey(id) });
        setEditOpen(false);
      }
    } catch {}
    setEditSaving(false);
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (mangaLoading) {
    return (
      <div className="container py-8 max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row gap-8">
          <Skeleton className="w-full md:w-[300px] aspect-[2/3] rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-4 mt-4 md:mt-0">
            <Skeleton className="h-10 w-3/4" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-32 w-full mt-6" />
          </div>
        </div>
      </div>
    );
  }

  if (!manga) return <div className="text-center py-24">العمل غير موجود</div>;

  const typeLabel = manga.type === "manga" ? "مانغا" : "مانهوا";

  return (
    <div className="w-full pb-24">

      {/* ── Publisher Bar ──────────────────────────────────────────────────── */}
      {publisherToken && (
        <div className="bg-primary/10 border-b border-primary/30 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-primary ml-auto">⚙ وضع الناشر</span>
          <Button
            size="sm" variant="outline"
            className="gap-1.5 h-7 text-xs border-primary/40 hover:bg-primary/10"
            onClick={openEdit}
          >
            <Pencil className="w-3 h-3" /> تعديل البيانات
          </Button>
          <Button
            size="sm" variant="destructive"
            className="gap-1.5 h-7 text-xs"
            onClick={() => { setDeleteCode(""); setDeleteError(""); setDeleteOpen(true); }}
          >
            <Trash2 className="w-3 h-3" /> حذف العمل
          </Button>
        </div>
      )}

      {/* Backdrop */}
      <div className="relative w-full h-[40vh] min-h-[300px] overflow-hidden">
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        <div className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-30 blur-xl scale-110" style={{ backgroundImage: `url(${manga.coverImage || ""})` }} />
      </div>

      <div className="container max-w-6xl mx-auto px-4 -mt-[20vh] relative z-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Cover */}
          <div className="w-48 md:w-[300px] flex-shrink-0 mx-auto md:mx-0 shadow-2xl rounded-xl overflow-hidden border border-border/50 bg-secondary">
            <img src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"} alt={manga.title} className="w-full h-auto object-cover aspect-[2/3]" />
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col pt-4 md:pt-16">
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30">{typeLabel}</Badge>
              <Badge variant="outline">{manga.status === "ongoing" ? "مستمر" : manga.status === "completed" ? "مكتمل" : "متوقف"}</Badge>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{manga.title}</h1>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed mb-6">{(manga as any).description || "لا يوجد وصف."}</div>
            {(manga as any).genres && (manga as any).genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {(manga as any).genres.map((g: string) => <span key={g} className="text-xs font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">{g}</span>)}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {chapters && chapters.length > 0 && (
                <Link href={`/manga/${manga.id}/chapter/${chapters[0].id}`}>
                  <Button size="lg" className="px-8 rounded-full h-12 shadow-[0_0_20px_rgba(225,29,72,0.3)]">قراءة الفصل الأول</Button>
                </Link>
              )}
              {user && libChecked && (
                <Button size="lg" variant={inLibrary ? "secondary" : "outline"} className={`rounded-full h-12 px-6 gap-2 ${inLibrary ? "border-primary/40" : ""}`} onClick={toggleLibrary} disabled={libLoading}>
                  {inLibrary ? <><Check className="h-4 w-4 text-primary" /><span>في مكتبتي</span></> : <><BookMarked className="h-4 w-4" /><span>أضف للمكتبة</span></>}
                </Button>
              )}
              {!user && (
                <Link href="/sign-in">
                  <Button size="lg" variant="outline" className="rounded-full h-12 px-6 gap-2">
                    <BookMarked className="h-4 w-4" />أضف للمكتبة
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
              <div className="space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : chapters?.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-border/50">لا توجد فصول بعد.</div>
            ) : (
              <div className="grid gap-2.5">
                {chapters?.map((chapter) => {
                  const isRead = readChapters.has(chapter.id);
                  return (
                    <Link key={chapter.id} href={`/manga/${manga.id}/chapter/${chapter.id}`}>
                      <div className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${isRead ? "bg-secondary/10 border-border/30 opacity-60 hover:opacity-100 hover:bg-secondary/40" : "bg-secondary/30 hover:bg-secondary border-border/50 hover:border-primary/50"}`}>
                        <div className="flex items-center gap-3">
                          {isRead && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
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
                        <span className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${isRead ? "bg-primary/10 text-primary" : "bg-transparent text-muted-foreground opacity-0 group-hover:opacity-100"}`}>
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
                <Textarea placeholder="أضف تعليقاً..." value={commentContent} onChange={(e) => setCommentContent(e.target.value)} className="bg-background resize-none h-24" />
                <Button onClick={handleAddComment} disabled={!commentContent.trim() || addComment.isPending} className="w-full">إرسال التعليق</Button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-border/50 bg-secondary/20 text-center">
                <p className="text-sm text-muted-foreground mb-4">يجب تسجيل الدخول لإضافة تعليق.</p>
                <Link href="/sign-in"><Button variant="outline" size="sm">تسجيل الدخول</Button></Link>
              </div>
            )}
            <div className="space-y-4 mt-6">
              {commentsLoading ? <Skeleton className="h-24 w-full rounded-lg" /> : comments?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد تعليقات بعد.</p>
              ) : comments?.map((comment) => (
                <div key={comment.id} className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {comment.user?.username?.charAt(0)?.toUpperCase() ?? "؟"}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{comment.user?.username ?? "مجهول"}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(comment.createdAt), "yyyy/MM/dd HH:mm")}</span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/90 pl-10 pr-2">{comment.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete Manga Modal ─────────────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteOpen(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">حذف العمل</h3>
                  <p className="text-sm text-muted-foreground">هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
              </div>
              <button onClick={() => setDeleteOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              سيتم حذف <strong className="text-foreground">"{manga.title}"</strong> بجميع فصوله وصفحاته نهائياً.
            </p>
            <div className="space-y-2">
              <Label>أدخل رمز التحقق للتأكيد</Label>
              <Input
                type="password"
                placeholder="رمز التحقق"
                value={deleteCode}
                onChange={(e) => { setDeleteCode(e.target.value); setDeleteError(""); }}
                className="font-mono"
              />
              {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeleteManga} disabled={deleting || !deleteCode}>
                {deleting ? "جار الحذف..." : "تأكيد الحذف"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Manga Modal ───────────────────────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">تعديل بيانات العمل</h3>
              <button onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <Label>اسم العمل</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="اسم المانغا" />
            </div>

            <div className="space-y-1">
              <Label>القصة / الوصف</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="وصف العمل..." className="resize-none h-28" />
            </div>

            <div className="space-y-1">
              <Label>الحالة</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongoing">مستمر</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="hiatus">متوقف</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>التصنيفات (مفصولة بفواصل)</Label>
              <Input value={editGenres} onChange={(e) => setEditGenres(e.target.value)} placeholder="أكشن، مغامرة، خيال علمي" />
            </div>

            <div className="space-y-2">
              <Label>صورة الغلاف</Label>
              <div className="flex gap-2 items-start">
                {(editCoverFile ? URL.createObjectURL(editCoverFile) : editCoverUrl) && (
                  <img
                    src={editCoverFile ? URL.createObjectURL(editCoverFile) : editCoverUrl}
                    className="w-16 h-24 object-cover rounded-lg border border-border shrink-0"
                    alt="cover"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <Input value={editCoverUrl} onChange={(e) => { setEditCoverUrl(e.target.value); setEditCoverFile(null); }} placeholder="رابط الغلاف (URL)" />
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => coverInputRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" />
                    {editCoverFile ? editCoverFile.name : "رفع صورة جديدة"}
                  </Button>
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEditCoverFile(f); setEditCoverUrl(""); } }} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button onClick={handleEditManga} disabled={editSaving || !editTitle.trim()}>
                {editSaving ? "جار الحفظ..." : "حفظ التغييرات"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
