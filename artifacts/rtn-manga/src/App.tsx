import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import MangaList from "@/pages/manga-list";
import MangaDetail from "@/pages/manga-detail";
import Reader from "@/pages/reader";
import Publisher from "@/pages/publisher";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Profile from "@/pages/profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const HomeRoute = () => <Layout><Home /></Layout>;
const MangaListRoute = () => <Layout><MangaList /></Layout>;
const MangaDetailRoute = () => <Layout><MangaDetail /></Layout>;
const PublisherRoute = () => <Layout><Publisher /></Layout>;
const LoginRoute = () => <Layout><Login /></Layout>;
const RegisterRoute = () => <Layout><Register /></Layout>;
const ProfileRoute = () => <Layout><Profile /></Layout>;
const NotFoundRoute = () => <Layout><NotFound /></Layout>;

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/manga" component={MangaListRoute} />
      <Route path="/manga/:id" component={MangaDetailRoute} />
      <Route path="/manga/:id/chapter/:chapterId" component={Reader} />
      <Route path="/publish" component={PublisherRoute} />
      <Route path="/login" component={LoginRoute} />
      <Route path="/register" component={RegisterRoute} />
      <Route path="/profile" component={ProfileRoute} />
      <Route component={NotFoundRoute} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
