import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman Tidak Ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak tersedia.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Route Error:", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070A13] px-4">
      <div className="max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight text-rose-400">
          Terjadi Kesalahan Halaman
        </h1>
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-rose-300 break-words text-left overflow-auto max-h-40">
          {error?.message || "Unknown client runtime error."}
        </div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-cyan-500 hover:bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors"
          >
            Coba Lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors"
          >
            Ke Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ADHD Biofeedback Monitor — Muhammad Reza (UMSU 2026)" },
      { name: "description", content: "Sistem Wearable IoT Multisensor Berbasis Biofeedback untuk Anak ADHD." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#070A13] text-slate-100 antialiased selection:bg-[#00D4FF]/30 selection:text-white">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/context/ToastContext";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isLoginPage = path === "/login";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {isLoginPage ? (
            <div className="min-h-screen bg-[#070A13] flex flex-col">
              <main key={path} className="flex-1 p-4 md:p-8 max-w-[1680px] w-full mx-auto">
                <Outlet />
              </main>
            </div>
          ) : (
            <div className="min-h-screen flex bg-[#070A13]">
              <Sidebar />
              <div className="flex-1 flex flex-col pl-64 min-w-0">
                <Header />
                <main key={path} className="flex-1 p-6 md:p-8 max-w-[1680px] w-full mx-auto">
                  <Outlet />
                </main>
              </div>
            </div>
          )}
          <Toaster position="top-right" richColors theme="dark" />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
