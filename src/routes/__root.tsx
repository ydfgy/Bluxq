import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { BRAND_ICON_SRC, Navbar, SecurityNotice } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Essa página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bluxq — Trade cripto com Robux" },
      {
        name: "description",
        content: "Opere BTC, ETH, SOL e mais com Robux, alavancagem e stake.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: BRAND_ICON_SRC, type: "image/png", sizes: "256x256" },
      { rel: "apple-touch-icon", href: BRAND_ICON_SRC, sizes: "256x256" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { const isWalletInjectionError = (event) => { const message = String(event?.message || event?.reason?.message || event?.reason || ""); const file = String(event?.filename || ""); return message.includes("Cannot redefine property: ethereum") || file.includes("evmAsk.js"); }; window.addEventListener("error", (event) => { if (isWalletInjectionError(event)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true); window.addEventListener("unhandledrejection", (event) => { if (isWalletInjectionError(event)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true); })();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const isWalletInjectionError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = String(
        "message" in event
          ? event.message
          : ((event.reason as { message?: string } | undefined)?.message ?? event.reason),
      );
      const file = "filename" in event ? event.filename : "";
      return message.includes("Cannot redefine property: ethereum") || file.includes("evmAsk.js");
    };
    const onError = (event: ErrorEvent) => {
      if (isWalletInjectionError(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isWalletInjectionError(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Navbar />
        <SecurityNotice />
        <Outlet />
        <footer className="border-t border-border/60 px-4 py-5 text-center text-xs leading-5 text-muted-foreground">
          Operações, saldos BX e transferências são registrados e estão sujeitos aos Termos da Bluxq.
          Consulte as regras antes de operar.
        </footer>
        <Toaster theme="dark" position="bottom-left" duration={3000} closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
