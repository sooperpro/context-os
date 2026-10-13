import { ClerkProvider } from "@clerk/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/config/env";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { createQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per app instance; useState keeps it stable across re-renders.
  const [queryClient] = useState(createQueryClient);
  const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY is required. Add it to apps/web/.env before starting the web app.",
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGate>{children}</AuthGate>
          <Toaster richColors position="top-right" />
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </QueryClientProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
