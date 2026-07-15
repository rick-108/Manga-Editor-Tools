import { useAuth } from "@/hooks/use-auth";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { LogOut, User as UserIcon } from "lucide-react";
import { useEffect } from "react";

export default function Profile() {
  const { user, token, logout, setUser } = useAuth();
  const [, setLocation] = useLocation();

  const { data: me, isLoading } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
    },
    request: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  });

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, setLocation]);

  useEffect(() => {
    if (me && !user) {
      setUser(me);
    }
  }, [me, user, setUser]);

  if (isLoading) {
    return (
      <div className="container max-w-3xl mx-auto py-12 px-4 space-y-8">
        <div className="flex items-center gap-6 p-8 bg-card rounded-xl border border-border">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!me) return null; // Will redirect

  return (
    <div className="container max-w-3xl mx-auto py-12 px-4 space-y-8">
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 p-8 bg-card rounded-xl border border-border shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-background overflow-hidden shrink-0 shadow-md">
            {me.avatar ? (
              <img src={me.avatar} alt={me.username} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-10 h-10" />
            )}
          </div>
          <div className="text-center md:text-right space-y-1 pt-2">
            <h1 className="text-3xl font-bold tracking-tight">{me.username}</h1>
            {me.email && <p className="text-muted-foreground">{me.email}</p>}
            <p className="text-xs text-muted-foreground/80 mt-2 inline-block bg-secondary px-2 py-1 rounded-full">
              عضو منذ: {format(new Date(me.createdAt), "yyyy/MM/dd")}
            </p>
          </div>
        </div>
        <Button 
          variant="destructive" 
          onClick={() => {
            logout();
            setLocation("/");
          }}
          className="md:mt-2"
        >
          <LogOut className="w-4 h-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight px-2">نشاطاتي</h2>
        <div className="bg-secondary/20 rounded-xl border border-border/50 p-12 text-center text-muted-foreground">
          لا يوجد نشاط مسجل حتى الآن.
        </div>
      </div>
    </div>
  );
}
