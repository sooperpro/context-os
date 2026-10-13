import { SparklesIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-5 text-primary" aria-hidden />
            ContextOS
          </NavLink>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        ContextOS · Evidence-backed project context
      </footer>
    </div>
  );
}
