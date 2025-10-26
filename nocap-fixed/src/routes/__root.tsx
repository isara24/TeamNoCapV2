// src/routes/__root.tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import ErrorBoundary from "@/components/ErrorBoundary";
import FloatingBanner from "@/components/FloatingBanner";
import Logo from "@/components/Logo"; // wraps "@/assets/logo.svg?react"

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 p-3">
        <Logo width={120} height={28} />
        <strong className="text-lg">NoCap</strong>
      </header>

      <ErrorBoundary tagName="main" className="flex-1">
        <Outlet />
      </ErrorBoundary>

      <TanStackRouterDevtools position="bottom-right" />
      <FloatingBanner position="bottom-left" />
    </div>
  );
}
