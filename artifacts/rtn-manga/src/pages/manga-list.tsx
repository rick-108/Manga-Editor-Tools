import { useState } from "react";
import { useListManga } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";

function MangaTypeLabel({ type }: { type: string }) {
  if (type === "manga") return "مانغا";
  return "مانهوا";
}

export default function MangaList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const { data, isLoading } = useListManga({
    search: debouncedSearch || undefined,
    type: type && type !== "all" ? type : undefined,
    status: status && status !== "all" ? status : undefined,
    limit: 50,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
  };

  return (
    <div className="container py-8 px-4 md:px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">المكتبة</h1>

        <form onSubmit={handleSearch} className="flex w-full md:w-auto items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن عمل..."
              className="pr-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="manga">مانغا</SelectItem>
              <SelectItem value="manhwa">مانهوا</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="ongoing">مستمر</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="dropped">متوقف</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">بحث</Button>
        </form>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="w-full aspect-[2/3] rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : data?.data?.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground">
          لا توجد أعمال مطابقة لبحثك.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {data?.data.map((manga) => (
            <Link key={manga.id} href={`/manga/${manga.id}`} className="group relative rounded-lg overflow-hidden flex flex-col h-full">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg mb-3 bg-secondary/30">
                <img
                  src={manga.coverImage || "https://placehold.co/400x600/1a1a1a/666?text=No+Cover"}
                  alt={manga.title}
                  className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute top-2 right-2">
                  <span className="bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                    <MangaTypeLabel type={manga.type} />
                  </span>
                </div>
              </div>
              <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">
                {manga.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {manga.status === "ongoing" ? "مستمر" : manga.status === "completed" ? "مكتمل" : "متوقف"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
