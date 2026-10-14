import { ClerkProvider } from "@clerk/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/config/env";
import { useClerkAppearance } from "@/features/auth/clerk-appearance";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { useTheme } from "@/hooks/use-theme";
import { createQueryClient } from "@/lib/query-client";

/** Clerk themed from the design tokens, following the active theme. */
function ThemedClerkProvider({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const appearance = useClerkAppearance(resolvedTheme);
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}

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
    <ThemeProvider>
      <ThemedClerkProvider publishableKey={publishableKey}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthGate>{children}</AuthGate>
          </TooltipProvider>
          <Toaster position="bottom-center" offset={24} mobileOffset={{ bottom: 96 }} />
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </QueryClientProvider>
      </ThemedClerkProvider>
    </ThemeProvider>
  );
}
