import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { arSA } from "@clerk/localizations";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { UserProfileProvider } from "@/contexts/user-profile-context";

import Home from "@/pages/home";
import MangaList from "@/pages/manga-list";
import MangaDetail from "@/pages/manga-detail";
import Reader from "@/pages/reader";
import Publisher from "@/pages/publisher";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// REQUIRED — copy verbatim
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(346 87% 43%)",
    colorForeground: "hsl(0 0% 98%)",
    colorMutedForeground: "hsl(240 5% 65%)",
    colorDanger: "hsl(0 63% 31%)",
    colorBackground: "hsl(240 10% 4%)",
    colorInput: "hsl(240 10% 12%)",
    colorInputForeground: "hsl(0 0% 98%)",
    colorNeutral: "hsl(240 10% 12%)",
    fontFamily: "inherit",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(240,10%,6%)] border border-[hsl(240,10%,12%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold text-2xl",
    headerSubtitle: "text-[hsl(240,5%,65%)]",
    socialButtonsBlockButtonText: "text-white font-medium",
    socialButtonsBlockButton: "border-[hsl(240,10%,18%)] hover:bg-[hsl(240,10%,12%)]",
    formFieldLabel: "text-[hsl(0,0%,85%)] font-medium",
    formFieldInput: "bg-[hsl(240,10%,10%)] border-[hsl(240,10%,18%)] text-white",
    formButtonPrimary: "bg-[hsl(346,87%,43%)] hover:bg-[hsl(346,87%,38%)] text-white font-bold",
    footerActionText: "text-[hsl(240,5%,65%)]",
    footerActionLink: "text-[hsl(346,87%,55%)] hover:text-[hsl(346,87%,65%)]",
    footerAction: "bg-transparent border-t border-[hsl(240,10%,12%)]",
    dividerText: "text-[hsl(240,5%,65%)]",
    dividerLine: "bg-[hsl(240,10%,12%)]",
    identityPreviewEditButton: "text-[hsl(346,87%,55%)]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-white",
    alert: "bg-[hsl(240,10%,8%)] border-[hsl(240,10%,15%)]",
    otpCodeFieldInput: "bg-[hsl(240,10%,10%)] border-[hsl(240,10%,18%)] text-white",
    formFieldRow: "gap-3",
    logoBox: "p-4",
    logoImage: "h-8 w-auto",
    main: "gap-5",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prevIdRef.current !== undefined && prevIdRef.current !== id) qc.clear();
      prevIdRef.current = id;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Layout><Home /></Layout>} />
      <Route path="/manga" component={() => <Layout><MangaList /></Layout>} />
      <Route path="/manga/:id" component={() => <Layout><MangaDetail /></Layout>} />
      <Route path="/manga/:id/chapter/:chapterId" component={Reader} />
      <Route path="/publish" component={() => <Layout><Publisher /></Layout>} />
      <Route path="/profile" component={() => <Layout><Profile /></Layout>} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={() => <Layout><NotFound /></Layout>} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        ...arSA,
        signIn: {
          ...(arSA.signIn ?? {}),
          start: { title: "مرحباً بعودتك", subtitle: "سجّل دخولك للمتابعة" },
        },
        signUp: {
          ...(arSA.signUp ?? {}),
          start: { title: "إنشاء حساب جديد", subtitle: "انضم إلى مجتمع RTN مانغا" },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <UserProfileProvider>
              <ClerkQueryCacheInvalidator />
              <Router />
              <Toaster />
            </UserProfileProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
