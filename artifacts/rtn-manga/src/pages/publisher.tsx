import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  usePublisherAuth, 
  useCreateManga, 
  useCreateChapter, 
  useListPendingChapters,
  useListManga,
  usePublishChapter,
  useDeleteChapter,
  useDeletePage,
  useListChapters,
  useListPages,
  getListChaptersQueryKey,
  getListPagesQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";

export default function Publisher() {
  const { publisherToken, setPublisherToken } = useAuth();
  const [code, setCode] = useState("");
  const auth = usePublisherAuth();
  const { toast } = useToast();

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    auth.mutate(
      { data: { code } },
      {
        onSuccess: (res) => {
          if (res.success && res.token) {
            setPublisherToken(res.token);
            toast({ title: "تم الدخول كـ ناشر" });
          } else {
            toast({ variant: "destructive", title: "الرمز غير صحيح" });
          }
        }
      }
    );
  };

  if (!publisherToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="w-full max-w-sm space-y-4">
          <Label>أدخل رمز الناشر</Label>
          <Input 
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center font-mono"
            required
          />
          <Button type="submit" className="w-full" disabled={auth.isPending}>
            دخول
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">لوحة تحكم الناشر</h1>
        <Button variant="outline" onClick={() => setPublisherToken(null)}>
          الخروج من لوحة الناشر
        </Button>
      </div>

      <Tabs defaultValue="remote" className="w-full">
        <TabsList className="flex w-full h-auto overflow-x-auto gap-1 justify-start p-1.5 rounded-xl bg-secondary/50 scrollbar-none">
          <TabsTrigger value="remote" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">📥 استيراد بعيد</TabsTrigger>
          <TabsTrigger value="bulk" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">📦 رفع جماعي</TabsTrigger>
          <TabsTrigger value="add-chapter" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">➕ رفع يدوي</TabsTrigger>
          <TabsTrigger value="pending" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">⏳ الفصول المعلقة</TabsTrigger>
          <TabsTrigger value="create-manga" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">📚 إنشاء مانغا</TabsTrigger>
          <TabsTrigger value="featured" className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 rounded-lg text-sm">⭐ أعمال جديدة</TabsTrigger>
        </TabsList>
        
        <div className="mt-6 bg-card border border-border rounded-xl p-6 shadow-sm">
          <TabsContent value="remote">
            <RemoteImportForm token={publisherToken} />
          </TabsContent>
          <TabsContent value="bulk">
            <BulkChapterUploader token={publisherToken} />
          </TabsContent>
          <TabsContent value="add-chapter">
            <AddChapterForm token={publisherToken} />
          </TabsContent>
          <TabsContent value="pending">
            <PendingChapters token={publisherToken} />
          </TabsContent>
          <TabsContent value="create-manga">
            <CreateMangaForm token={publisherToken} />
          </TabsContent>
          <TabsContent value="featured">
            <FeaturedManager token={publisherToken} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

const GENRES = [
  "أكشن", "مغامرة", "كوميديا", "دراما", "خيال", "رومانسية", "خيال علمي",
  "شريحة من الحياة", "رياضة", "رعب", "غموض", "نفسي", "تاريخي", "فنون قتالية",
  "إيسيكاي", "سحر", "مدرسي", "خارق للطبيعة", "ما بعد الكارثة",
  "شونن", "شوجو", "سينين", "جوسي", "وحوش", "مصاصو دماء",
  "ألعاب", "موسيقى", "طبخ", "قوى خارقة", "حريم"
];

function CreateMangaForm({ token }: { token: string }) {
  const createManga = useCreateManga({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [type, setType] = useState("manhwa");
  const [status, setStatus] = useState("ongoing");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalCoverUrl = coverImage;

    if (coverFile) {
      const formData = new FormData();
      formData.append("cover", coverFile);
      try {
        const res = await fetch("/api/uploads/cover", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (data.url) finalCoverUrl = data.url;
      } catch {
        toast({ variant: "destructive", title: "فشل رفع الغلاف" });
        return;
      }
    }

    createManga.mutate({
      data: { title, description, coverImage: finalCoverUrl, type, status, genres: selectedGenres }
    }, {
      onSuccess: () => {
        toast({ title: "تم إنشاء العمل بنجاح" });
        setTitle(""); setDescription(""); setCoverImage(""); setCoverFile(null); setSelectedGenres([]);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>العنوان</Label>
        <Input required value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>الوصف</Label>
        <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      
      <div className="grid grid-cols-2 gap-4 border p-4 rounded-lg bg-secondary/10">
        <div className="space-y-2">
          <Label>رابط صورة الغلاف</Label>
          <Input value={coverImage} onChange={e => setCoverImage(e.target.value)} placeholder="https://..." disabled={!!coverFile} />
        </div>
        <div className="space-y-2">
          <Label>أو رفع صورة</Label>
          <Input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} disabled={!!coverImage} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>النوع</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manhwa">مانهوا</SelectItem>
              <SelectItem value="manga">مانغا</SelectItem>
              <SelectItem value="manhua">مانهوا صينية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>الحالة</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ongoing">مستمر</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="dropped">متوقف</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>التصنيفات</Label>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 p-4 border rounded-lg bg-secondary/5">
          {GENRES.map(g => (
            <div key={g} className="flex items-center space-x-2 space-x-reverse">
              <Checkbox 
                id={`genre-${g}`} 
                checked={selectedGenres.includes(g)}
                onCheckedChange={(checked) => {
                  if (checked) setSelectedGenres([...selectedGenres, g]);
                  else setSelectedGenres(selectedGenres.filter(x => x !== g));
                }}
              />
              <Label htmlFor={`genre-${g}`} className="text-sm cursor-pointer">{g}</Label>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={createManga.isPending} className="w-full">
        {createManga.isPending ? "جاري الإنشاء..." : "إنشاء العمل"}
      </Button>
    </form>
  );
}

function AddChapterForm({ token }: { token: string }) {
  const { data: mangaList } = useListManga({ limit: 100 });
  const createChapter = useCreateChapter({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mangaId, setMangaId] = useState("");
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mangaId || !number || !files || files.length === 0) return;
    try {
      setUploading(true);
      const chapter = await createChapter.mutateAsync({
        mangaId: Number(mangaId),
        data: { number: Number(number), title: title || undefined }
      });

      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("pages", f));

      const uploadRes = await fetch(`/api/manga/${mangaId}/chapters/${chapter.id}/pages/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!uploadRes.ok) throw new Error("فشل رفع الصفحات");
      toast({ title: "تم إنشاء الفصل ورفع الصفحات، بانتظار النشر." });
      setNumber(""); setTitle(""); setFiles(null);
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الرفع" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>اختر العمل</Label>
        <Select value={mangaId} onValueChange={setMangaId}>
          <SelectTrigger><SelectValue placeholder="اختر المانغا" /></SelectTrigger>
          <SelectContent>
            {mangaList?.data.map(m => (
              <SelectItem key={m.id} value={m.id.toString()}>{m.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>رقم الفصل</Label>
          <Input type="number" step="0.1" required value={number} onChange={e => setNumber(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>عنوان الفصل (اختياري)</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>صفحات الفصل</Label>
        <div className="border-2 border-dashed rounded-lg p-8 text-center bg-secondary/10 hover:bg-secondary/20 transition-colors">
          <Input type="file" multiple accept="image/*" className="hidden" id="pages-upload" onChange={e => setFiles(e.target.files)} />
          <Label htmlFor="pages-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
            <span className="text-primary font-bold">اختر الصور</span>
            <span className="text-xs text-muted-foreground">
              {files ? `تم اختيار ${files.length} صورة` : "يمكنك اختيار عدة صور معاً"}
            </span>
          </Label>
        </div>
      </div>

      <Button type="submit" disabled={uploading || !mangaId || !files} className="w-full">
        {uploading ? "جاري الرفع..." : "إنشاء ورفع"}
      </Button>
    </form>
  );
}

type RemoteStep = "form" | "progress" | "review";

interface JobPoll {
  id: string;
  status: "pending" | "fetching" | "downloading" | "done" | "error";
  error?: string;
  chapterId: number;
  mangaId: number;
  total: number;
  downloaded: number;
  failedCount: number;
  autoPublish?: boolean;
}

function RemoteImportForm({ token }: { token: string }) {
  const { data: mangaList } = useListManga({ limit: 100 });
  const [mangaId, setMangaId]     = useState("");
  const [chapNum, setChapNum]     = useState("");
  const [chapTitle, setChapTitle] = useState("");
  const [url, setUrl]             = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const [step, setStep]           = useState<RemoteStep>("form");
  const [submitting, setSubmitting] = useState(false);

  // Job state
  const [job, setJob]                         = useState<JobPoll | null>(null);
  const [importedMangaId, setImportedMangaId] = useState<number | null>(null);
  const [importedChapterId, setImportedChapterId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const publishChapter = usePublishChapter({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const deleteChapter  = useDeleteChapter ({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const deletePage     = useDeletePage    ({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const queryClient    = useQueryClient();
  const { toast }      = useToast();

  const { data: pages, isLoading: pagesLoading, refetch: refetchPages } = useListPages(
    importedMangaId  ?? 0,
    importedChapterId ?? 0,
    {
      query: {
        enabled: !!importedMangaId && !!importedChapterId && step === "review",
        queryKey: getListPagesQueryKey(importedMangaId ?? 0, importedChapterId ?? 0),
        refetchInterval: step === "review" ? 3000 : false,
      },
      request: { headers: { Authorization: `Bearer ${token}` } }
    }
  );

  const sortedPages = [...(pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startPolling = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/remote/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data: JobPoll = await res.json();
        setJob(data);

        if (data.status === "done" || data.status === "error") {
          stopPolling();
          if (data.status === "done") {
            // Auto-publish mode: skip review, reset and notify
            if (data.autoPublish) {
              queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
              if (data.failedCount > 0) {
                toast({ variant: "destructive", title: `✅ نُشر تلقائياً — ${data.failedCount} صورة فشلت`, description: "راجع الفصل من قائمة الفصول المنتظرة" });
              } else {
                toast({ title: `✅ نُشر ${data.downloaded} صفحة تلقائياً!` });
              }
              resetForm();
              return;
            }
            // Manual review mode
            setImportedMangaId(data.mangaId);
            setImportedChapterId(data.chapterId);
            await queryClient.invalidateQueries({ queryKey: getListPagesQueryKey(data.mangaId, data.chapterId) });
            setStep("review");
            if (data.failedCount > 0) {
              toast({ variant: "destructive", title: `${data.failedCount} صورة فشلت`, description: "يمكنك إعادة المحاولة من زر Retry" });
            } else {
              toast({ title: `✅ تم تنزيل ${data.downloaded} صفحة بنجاح!` });
            }
          } else {
            toast({ variant: "destructive", title: "فشل الاستيراد", description: data.error });
            setStep("form");
          }
        }
      } catch { }
    }, 2000);
  };

  const resetForm = () => {
    stopPolling();
    setStep("form");
    setJob(null);
    setImportedChapterId(null);
    setImportedMangaId(null);
    setUrl(""); setChapNum(""); setChapTitle(""); setMangaId("");
    setAutoPublish(false);
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mangaId || !chapNum || !url) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/remote/start-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, mangaId: Number(mangaId), chapterNumber: Number(chapNum), chapterTitle: chapTitle || undefined, autoPublish }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل بدء الاستيراد");
      setJob({ id: data.jobId, status: "fetching", chapterId: data.chapterId, mangaId: data.mangaId, total: 0, downloaded: 0, failedCount: 0, autoPublish });
      setStep("progress");
      startPolling(data.jobId);
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الاستيراد", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!job) return;
    try {
      const res = await fetch(`/api/remote/job/${job.id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("فشل إعادة المحاولة");
      toast({ title: "⏳ جاري إعادة تنزيل الصفحات الفاشلة..." });
      setStep("progress");
      startPolling(job.id);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const handlePublish = () => {
    if (!importedMangaId || !importedChapterId) return;
    publishChapter.mutate({ mangaId: importedMangaId, chapterId: importedChapterId }, {
      onSuccess: () => {
        toast({ title: "✅ تم نشر الفصل بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
        resetForm();
      },
      onError: () => toast({ variant: "destructive", title: "فشل النشر" })
    });
  };

  const handleDeleteChapter = () => {
    if (!importedMangaId || !importedChapterId) return;
    if (!confirm("هل أنت متأكد من حذف الفصل كاملاً مع صفحاته؟")) return;
    deleteChapter.mutate({ mangaId: importedMangaId, chapterId: importedChapterId }, {
      onSuccess: () => { toast({ title: "تم حذف الفصل" }); resetForm(); },
      onError: () => toast({ variant: "destructive", title: "فشل الحذف" })
    });
  };

  const handleDeletePage = (pageId: number) => {
    if (!importedMangaId || !importedChapterId) return;
    if (!confirm("حذف هذه الصفحة؟")) return;
    deletePage.mutate({ mangaId: importedMangaId, chapterId: importedChapterId, pageId }, {
      onSuccess: () => { toast({ title: "تم حذف الصفحة" }); refetchPages(); },
      onError: () => toast({ variant: "destructive", title: "فشل حذف الصفحة" })
    });
  };

  // ── PROGRESS SCREEN ──
  if (step === "progress" && job) {
    const isFetching  = job.status === "fetching" || job.status === "pending";
    const pct         = job.total > 0 ? Math.round((job.downloaded / job.total) * 100) : 0;
    const statusLabel = isFetching
      ? "⏳ جاري تحليل الرابط واستخراج الصور..."
      : `📥 جاري التنزيل... ${job.downloaded} / ${job.total} صورة`;

    return (
      <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
        <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="w-full max-w-md space-y-3">
          <p className="text-base font-semibold">{statusLabel}</p>
          {!isFetching && job.total > 0 && (
            <>
              <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">{pct}% مكتمل</p>
            </>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            السيرفر يعمل في الخلفية — يمكنك تصفح الموقع بشكل طبيعي
          </p>
        </div>
      </div>
    );
  }

  // ── REVIEW SCREEN ──
  if (step === "review" && importedChapterId && importedMangaId) {
    const downloaded = job?.downloaded ?? sortedPages.length;
    const failed     = job?.failedCount ?? 0;

    return (
      <div className="space-y-5">
        {/* Status bar */}
        <div className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border ${failed > 0 ? "bg-yellow-950/20 border-yellow-700/40" : "bg-green-950/30 border-green-800/40"}`}>
          <div>
            <p className={`font-bold ${failed > 0 ? "text-yellow-400" : "text-green-400"}`}>
              {failed > 0
                ? `⚠️ تم تنزيل ${downloaded} صفحة — ${failed} صورة فشلت`
                : `✅ تم تنزيل ${downloaded} صفحة بنجاح!`}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pagesLoading ? "جاري تحميل الصفحات..." : `${sortedPages.length} صفحة جاهزة`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={resetForm}>← استيراد جديد</Button>
            {failed > 0 && (
              <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-400 hover:bg-yellow-950/30" onClick={handleRetry}>
                🔄 إعادة تنزيل الفاشلة ({failed})
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={handleDeleteChapter} disabled={deleteChapter.isPending}>
              🗑 حذف الفصل
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handlePublish}
              disabled={publishChapter.isPending || sortedPages.length === 0}
            >
              {publishChapter.isPending ? "جاري النشر..." : "✓ نشر الفصل"}
            </Button>
          </div>
        </div>

        {/* Pages grid */}
        {pagesLoading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>جاري تحميل الصور...</span>
          </div>
        ) : sortedPages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-xl bg-secondary/5">لا توجد صفحات</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {sortedPages.map((page, idx) => (
              <div key={page.id} className="group relative bg-secondary rounded-lg overflow-hidden" style={{ aspectRatio: "2/3" }}>
                <img src={page.imageUrl} className="w-full h-full object-cover" alt={`صفحة ${idx + 1}`} loading="lazy" />
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{idx + 1}</div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button type="button" onClick={() => handleDeletePage(page.id)}
                    className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white text-xl flex items-center justify-center shadow-lg">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── FORM ──
  return (
    <form onSubmit={handleDownload} className="space-y-6">
      <div className="p-4 bg-blue-950/20 border border-blue-800/30 rounded-xl text-sm text-blue-300 leading-relaxed">
        <strong>كيف يعمل؟</strong> أدخل بيانات الفصل ورابطه ← اضغط "تنزيل" ← يعمل السيرفر في الخلفية ويظهر لك شريط التقدم ← راجع الصور ← اضغط "نشر".
      </div>

      <div className="space-y-2">
        <Label>العمل (المانغا) *</Label>
        <Select value={mangaId} onValueChange={setMangaId} required>
          <SelectTrigger><SelectValue placeholder="اختر المانغا" /></SelectTrigger>
          <SelectContent>
            {mangaList?.data.map(m => (
              <SelectItem key={m.id} value={m.id.toString()}>{m.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>رقم الفصل *</Label>
          <Input type="number" step="0.1" min="0" required value={chapNum} onChange={e => setChapNum(e.target.value)} placeholder="مثال: 1" />
        </div>
        <div className="space-y-2">
          <Label>عنوان الفصل (اختياري)</Label>
          <Input value={chapTitle} onChange={e => setChapTitle(e.target.value)} placeholder="اختياري" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>رابط الفصل *</Label>
        <Input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mangalek.com/..." dir="ltr" className="font-mono text-sm" />
        <p className="text-xs text-muted-foreground">ضع رابط صفحة الفصل مباشرةً (وليس الصفحة الرئيسية للمانغا)</p>
      </div>

      {/* Auto-publish toggle */}
      <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${autoPublish ? "bg-green-950/25 border-green-700/50" : "bg-secondary/20 border-secondary/40 hover:bg-secondary/30"}`}>
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 accent-green-500"
          checked={autoPublish}
          onChange={e => setAutoPublish(e.target.checked)}
        />
        <div>
          <p className="font-semibold text-sm">
            {autoPublish ? "⚡ نشر تلقائي فوري" : "👁 تحويل للمراجعة اليدوية"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {autoPublish
              ? "الفصل سيُنشر مباشرةً بعد انتهاء التنزيل — مثالي للرفع الجماعي لآلاف الفصول"
              : "ستُراجع الصور وتحذف ما لا تريده قبل النشر"}
          </p>
        </div>
      </label>

      <Button type="submit" className={`w-full h-12 text-base ${autoPublish ? "bg-green-600 hover:bg-green-700" : ""}`} disabled={!mangaId || !chapNum || !url || submitting}>
        {submitting ? "⏳ جاري البدء..." : autoPublish ? "⚡ تنزيل ونشر تلقائي" : "📥 تنزيل وإنشاء الفصل"}
      </Button>
    </form>
  );
}

// ─── Bulk Chapter Uploader ────────────────────────────────────────────────────

interface BulkLogEntry {
  id: number;
  status: "running" | "done" | "error" | "wait" | "info";
  text: string;
}

function BulkChapterUploader({ token }: { token: string }) {
  const { data: mangaList } = useListManga({ limit: 100 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form inputs
  const [mangaId, setMangaId]         = useState("");
  const [baseUrl, setBaseUrl]         = useState("");
  const [startChap, setStartChap]     = useState("1");
  const [endChap, setEndChap]         = useState("10");
  const [delaySeconds, setDelaySeconds] = useState("7");
  const [autoPublish, setAutoPublish] = useState(false);

  // Run state
  const [running, setRunning] = useState(false);
  const [logs, setLogs]       = useState<BulkLogEntry[]>([]);
  const logRef   = useRef<HTMLDivElement>(null);
  const stopRef  = useRef(false);
  const idRef    = useRef(0);

  // Helpers
  const nextId = () => ++idRef.current;

  const appendLog = (entry: Omit<BulkLogEntry, "id">): number => {
    const id = nextId();
    setLogs(prev => [...prev, { ...entry, id }]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
    return id;
  };

  const patchLog = (id: number, patch: Partial<Omit<BulkLogEntry, "id">>) =>
    setLogs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

  const removeLog = (id: number) =>
    setLogs(prev => prev.filter(l => l.id !== id));

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  /** Poll a job until done/error. Updates the log line as pages arrive. */
  const pollJob = (jobId: string, logId: number, chap: number) =>
    new Promise<{ downloaded: number; failedCount: number; error?: string }>(resolve => {
      const iv = setInterval(async () => {
        if (stopRef.current) { clearInterval(iv); resolve({ downloaded: 0, failedCount: 0, error: "stopped" }); return; }
        try {
          const r = await fetch(`/api/remote/job/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) return;
          const d = await r.json();
          if ((d.status === "storing" || d.status === "fetching") && d.total > 0) {
            patchLog(logId, { text: `🔗 الفصل ${chap}: ${d.downloaded}/${d.total} رابط...` });
          }
          if (d.status === "done")  { clearInterval(iv); resolve({ downloaded: d.downloaded, failedCount: d.failedCount ?? 0 }); }
          if (d.status === "error") { clearInterval(iv); resolve({ downloaded: 0, failedCount: 0, error: d.error ?? "خطأ غير معروف" }); }
        } catch { /* network hiccup */ }
      }, 2000);
    });

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = parseInt(startChap);
    const end   = parseInt(endChap);
    if (!mangaId || !baseUrl || isNaN(start) || isNaN(end) || start > end) {
      toast({ variant: "destructive", title: "تحقق من المدخلات" });
      return;
    }

    setRunning(true);
    stopRef.current = false;
    idRef.current   = 0;
    setLogs([]);

    const totalChapters = end - start + 1;
    appendLog({ status: "info", text: `🚀 بدء الرفع الجماعي: الفصول ${start} → ${end} (${totalChapters} فصل) — تأخير ${delaySeconds}ث بين كل فصل` });

    let successCount = 0;
    let errorCount   = 0;

    for (let chap = start; chap <= end; chap++) {
      if (stopRef.current) {
        appendLog({ status: "error", text: "⛔ تم الإيقاف من قِبَل الناشر." });
        break;
      }

      const url    = baseUrl.replace(/(\d+)(?=\D*$)/, String(chap));
      const logId  = appendLog({ status: "running", text: `⏳ الفصل ${chap}: جاري الاتصال بالرابط...` });
      const chapMs = Math.max(1000, parseInt(delaySeconds) * 1000);

      try {
        const res = await fetch("/api/remote/start-import", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url, mangaId: Number(mangaId), chapterNumber: chap, autoPublish }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          patchLog(logId, { status: "error", text: `❌ الفصل ${chap}: فشل — ${errData.error ?? res.statusText}` });
          errorCount++;
        } else {
          const { jobId } = await res.json();
          patchLog(logId, { text: `📡 الفصل ${chap}: جاري التحليل والتنزيل...` });
          const result = await pollJob(jobId, logId, chap);

          if (result.error && result.error !== "stopped") {
            patchLog(logId, { status: "error", text: `❌ الفصل ${chap}: فشل — ${result.error}` });
            errorCount++;
          } else if (!result.error) {
            const suffix = result.failedCount > 0 ? ` (⚠️ ${result.failedCount} فشلت)` : "";
            patchLog(logId, { status: "done", text: `✅ الفصل ${chap}: تم — ${result.downloaded} صفحة${suffix}` });
            successCount++;
            queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
          }
        }
      } catch (err: any) {
        patchLog(logId, { status: "error", text: `❌ الفصل ${chap}: خطأ — ${err.message}` });
        errorCount++;
      }

      // Delay between chapters (skip after last one)
      if (chap < end && !stopRef.current) {
        const waitId = appendLog({ status: "wait", text: `⏱ انتظار ${delaySeconds}ث قبل الفصل ${chap + 1}...` });
        await sleep(chapMs);
        removeLog(waitId);
      }
    }

    if (!stopRef.current) {
      appendLog({
        status: errorCount === 0 ? "done" : successCount > 0 ? "info" : "error",
        text: `🏁 انتهى الرفع الجماعي — نجح: ${successCount} / فشل: ${errorCount} من أصل ${totalChapters} فصل`,
      });
      toast({ title: errorCount === 0 ? "✅ انتهى الرفع بنجاح!" : `انتهى: ${successCount} نجح، ${errorCount} فشل` });
    }

    setRunning(false);
  };

  const handleStop = () => { stopRef.current = true; };

  // Colour coding
  const logClass = (status: BulkLogEntry["status"]) => {
    if (status === "done")    return "text-green-400";
    if (status === "error")   return "text-red-400";
    if (status === "wait")    return "text-yellow-400/70 italic";
    if (status === "info")    return "text-blue-300 font-semibold";
    return "text-foreground/80"; // running
  };

  const chapCount = Math.max(0, parseInt(endChap || "0") - parseInt(startChap || "0") + 1);
  const successCount = logs.filter(l => l.status === "done").length;
  const errorCount   = logs.filter(l => l.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="p-4 bg-blue-950/20 border border-blue-800/30 rounded-xl text-sm text-blue-300 leading-relaxed space-y-1">
        <p><strong>الرفع الجماعي التلقائي:</strong> الصق رابط الفصل الأول كما هو — سيقوم النظام بزيادة الرقم الأخير في الرابط تلقائياً للانتقال بين الفصول.</p>
        <p className="text-blue-400/70 text-xs">مثال: إذا أدخلت <code className="font-mono">https://site.com/series/ECD/1</code> سيسحب الفصول 1، 2، 3… بتغيير الرقم الأخير فقط.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleStart} className="space-y-5">
        {/* Manga selector */}
        <div className="space-y-2">
          <Label>العمل (المانغا) *</Label>
          <Select value={mangaId} onValueChange={setMangaId} required>
            <SelectTrigger><SelectValue placeholder="اختر المانغا" /></SelectTrigger>
            <SelectContent>
              {mangaList?.data.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* URL template */}
        <div className="space-y-2">
          <Label>رابط الفصل الأول *</Label>
          <Input
            type="url"
            required
            value={baseUrl}
            onChange={e => {
              const val = e.target.value;
              setBaseUrl(val);
              // استخراج آخر رقم في الرابط وتعيينه كفصل بداية تلقائياً
              const m = val.match(/(\d+)\D*$/);
              if (m) setStartChap(m[1]);
            }}
            placeholder="https://site.com/series/ECD/1"
            dir="ltr"
            className="font-mono text-sm"
            disabled={running}
          />
        </div>

        {/* Chapter range + delay */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>فصل البداية *</Label>
            <Input type="number" min="1" step="1" required value={startChap} onChange={e => setStartChap(e.target.value)} disabled={running} />
          </div>
          <div className="space-y-2">
            <Label>فصل النهاية *</Label>
            <Input type="number" min="1" step="1" required value={endChap} onChange={e => setEndChap(e.target.value)} disabled={running} />
          </div>
          <div className="space-y-2">
            <Label>تأخير بين الفصول (ث)</Label>
            <Input type="number" min="1" max="120" value={delaySeconds} onChange={e => setDelaySeconds(e.target.value)} disabled={running} />
          </div>
        </div>

        {/* Publish mode */}
        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${autoPublish ? "bg-green-950/25 border-green-700/50" : "bg-secondary/20 border-secondary/40 hover:bg-secondary/30"} ${running ? "opacity-60 pointer-events-none" : ""}`}>
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-500" checked={autoPublish} onChange={e => setAutoPublish(e.target.checked)} disabled={running} />
          <div>
            <p className="font-semibold text-sm">{autoPublish ? "⚡ نشر فوري لكل فصل" : "👁 تحويل للمراجعة اليدوية"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{autoPublish ? "كل فصل يُنشر تلقائياً فور انتهاء تنزيله" : "الفصول تُضاف كمعلقة وتُراجع يدوياً"}</p>
          </div>
        </label>

        {/* Action buttons */}
        {!running ? (
          <Button type="submit" className={`w-full h-12 text-base font-semibold ${autoPublish ? "bg-green-600 hover:bg-green-700" : ""}`} disabled={!mangaId || !baseUrl || chapCount <= 0}>
            🚀 بدء الرفع الجماعي ({chapCount} فصل)
          </Button>
        ) : (
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-3 bg-secondary/20 rounded-xl px-5 border border-border">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-sm">جاري الرفع الجماعي...</span>
            </div>
            <Button type="button" variant="destructive" className="px-6" onClick={handleStop}>
              ⛔ إيقاف
            </Button>
          </div>
        )}
      </form>

      {/* Log panel */}
      {logs.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Log header */}
          <div className="px-4 py-2.5 bg-secondary/30 border-b border-border flex items-center justify-between gap-4">
            <span className="text-sm font-semibold">📋 سجل العمليات</span>
            <div className="flex items-center gap-4 text-xs">
              {successCount > 0 && <span className="text-green-400 font-mono">{successCount} ✓ نجح</span>}
              {errorCount   > 0 && <span className="text-red-400 font-mono">{errorCount} ✗ فشل</span>}
              {running && (
                <span className="text-muted-foreground">
                  {successCount + errorCount} / {chapCount}
                </span>
              )}
            </div>
          </div>
          {/* Log entries */}
          <div
            ref={logRef}
            className="max-h-80 overflow-y-auto p-4 space-y-1 font-mono text-xs bg-black/30"
          >
            {logs.map(entry => (
              <div key={entry.id} className={`leading-relaxed ${logClass(entry.status)}`}>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingChapters({ token }: { token: string }) {
  const { data: pending, isLoading } = useListPendingChapters({
    request: { headers: { Authorization: `Bearer ${token}` } }
  });
  const publishChapter = usePublishChapter({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const deleteChapter  = useDeleteChapter ({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const queryClient    = useQueryClient();
  const { toast }      = useToast();

  const handlePublish = (mangaId: number, chapterId: number) => {
    publishChapter.mutate({ mangaId, chapterId }, {
      onSuccess: () => {
        toast({ title: "✅ تم النشر بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
      },
      onError: () => toast({ variant: "destructive", title: "فشل النشر" })
    });
  };

  const handleDelete = (mangaId: number, chapterId: number) => {
    if (!confirm("هل أنت متأكد من حذف الفصل؟")) return;
    deleteChapter.mutate({ mangaId, chapterId }, {
      onSuccess: () => {
        toast({ title: "تم الحذف" });
        queryClient.invalidateQueries({ queryKey: ["/api/publisher/pending-chapters"] });
      },
      onError: () => toast({ variant: "destructive", title: "فشل الحذف" })
    });
  };

  if (isLoading) return <div className="text-center py-12">جاري التحميل...</div>;
  if (!pending?.length) return (
    <div className="text-center py-16 text-muted-foreground border rounded-xl bg-secondary/5 space-y-2">
      <p className="text-2xl">✅</p>
      <p>لا توجد فصول معلقة</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {pending.map(chapter => (
        <PendingChapterCard
          key={chapter.id}
          chapter={chapter}
          token={token}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}

function PendingChapterCard({
  chapter,
  token,
  onPublish,
  onDelete,
}: {
  chapter: { id: number; mangaId: number; number: number; title?: string | null; pageCount?: number | null; manga?: { title?: string | null } | null };
  token: string;
  onPublish: (mangaId: number, chapterId: number) => void;
  onDelete: (mangaId: number, chapterId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const deletePage  = useDeletePage({ request: { headers: { Authorization: `Bearer ${token}` } } });
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const { data: pages, isLoading, refetch } = useListPages(chapter.mangaId, chapter.id, {
    query: {
      enabled: expanded,
      queryKey: getListPagesQueryKey(chapter.mangaId, chapter.id)
    },
    request: { headers: { Authorization: `Bearer ${token}` } }
  });

  const sortedPages = [...(pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);

  const handleDeletePage = (pageId: number) => {
    if (!confirm("حذف هذه الصفحة؟")) return;
    deletePage.mutate({ mangaId: chapter.mangaId, chapterId: chapter.id, pageId }, {
      onSuccess: () => {
        toast({ title: "تم حذف الصفحة" });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListPagesQueryKey(chapter.mangaId, chapter.id) });
      },
      onError: () => toast({ variant: "destructive", title: "فشل الحذف" })
    });
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-secondary/10">
        <div>
          <h3 className="font-bold text-lg">{chapter.manga?.title ?? ""} — فصل {chapter.number}</h3>
          <p className="text-sm text-muted-foreground">{chapter.pageCount ?? 0} صفحة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="border border-border"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? "إخفاء الصفحات ▲" : "عرض الصفحات ▼"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(chapter.mangaId, chapter.id)}>
            🗑 حذف
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onPublish(chapter.mangaId, chapter.id)}
          >
            ✓ نشر
          </Button>
        </div>
      </div>

      {/* Pages grid (collapsible) */}
      {expanded && (
        <div className="p-4 border-t border-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              جاري التحميل...
            </div>
          ) : sortedPages.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">لا توجد صفحات</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {sortedPages.map((page, idx) => (
                <div
                  key={page.id}
                  className="group relative bg-secondary rounded overflow-hidden"
                  style={{ aspectRatio: "2/3" }}
                >
                  <img src={page.imageUrl} className="w-full h-full object-cover" alt={`${idx + 1}`} loading="lazy" />
                  <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-1 rounded">
                    {idx + 1}
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handleDeletePage(page.id)}
                      className="w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white text-base flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Featured Manager ────────────────────────────────────────────────────────

type MangaItem = {
  id: number;
  title: string;
  coverImage: string | null;
  featured: boolean;
};

function FeaturedManager({ token }: { token: string }) {
  const { data: mangaData, isLoading, refetch } = useListManga({ limit: 200 });
  const { toast } = useToast();
  const [toggling, setToggling] = useState<number | null>(null);

  const toggle = async (id: number) => {
    setToggling(id);
    try {
      const res = await fetch(`/api/manga/${id}/feature`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await refetch();
      toast({ title: "تم تحديث حالة العمل" });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء التحديث" });
    }
    setToggling(null);
  };

  const all = (mangaData?.data ?? []) as MangaItem[];
  const featured = all.filter((m) => m.featured);
  const rest = all.filter((m) => !m.featured);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-secondary/40 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const MangaRow = ({ manga, isFeatured }: { manga: MangaItem; isFeatured: boolean }) => (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/30 border border-border/50">
      <div className="w-10 h-14 rounded-lg overflow-hidden bg-secondary/50 flex-shrink-0">
        <img
          src={manga.coverImage || "https://placehold.co/100x150/1a1a1a/666?text="}
          alt={manga.title}
          className="w-full h-full object-cover"
        />
      </div>
      <span className="flex-1 font-medium text-sm line-clamp-1">{manga.title}</span>
      <Button
        size="sm"
        variant={isFeatured ? "destructive" : "default"}
        className="shrink-0"
        disabled={toggling === manga.id}
        onClick={() => toggle(manga.id)}
      >
        {isFeatured ? "إزالة" : "إضافة للأعمال الجديدة"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg font-bold">⭐ الأعمال الجديدة الحالية</span>
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">{featured.length}</span>
        </div>
        {featured.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-border/50">
            لم تُضَف أي أعمال بعد. اختَر من القائمة أدناه.
          </div>
        ) : (
          <div className="space-y-2">{featured.map((m) => <MangaRow key={m.id} manga={m} isFeatured={true} />)}</div>
        )}
      </div>
      <div>
        <p className="text-lg font-bold mb-4">جميع الأعمال</p>
        {rest.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">جميع الأعمال مضافة بالفعل.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {rest.map((m) => <MangaRow key={m.id} manga={m} isFeatured={false} />)}
          </div>
        )}
      </div>
    </div>
  );
}
