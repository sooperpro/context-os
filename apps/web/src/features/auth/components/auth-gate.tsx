import { OrganizationList, SignIn, useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { setApiAccessTokenProvider } from "@/lib/api-client";

function FullPagePanel({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          ContextOS
        </div>
        {children}
      </div>
    </main>
  );
}

/** Blocks application data loading until Clerk has a signed-in user and active organization. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, orgId } = useAuth();

  // Development-only pages (the UI gallery) need no session and make no API calls.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/")) {
    return children;
  }

  if (!isLoaded) {
    return (
      <FullPagePanel>
        <Spinner className="size-6" aria-label="Loading authentication" />
      </FullPagePanel>
    );
  }

  if (!isSignedIn) {
    return (
      <FullPagePanel>
        <SignIn routing="hash" />
      </FullPagePanel>
    );
  }

  if (!orgId) {
    return (
      <FullPagePanel>
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Choose your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an organization or create one to continue to ContextOS.
          </p>
        </div>
        <OrganizationList
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
        />
      </FullPagePanel>
    );
  }

  return (
    <ApiAuthBridge getToken={getToken} orgId={orgId}>
      {children}
    </ApiAuthBridge>
  );
}

function ApiAuthBridge({
  children,
  getToken,
  orgId,
}: {
  children: ReactNode;
  getToken: () => Promise<string | null>;
  orgId: string;
}) {
  const queryClient = useQueryClient();
  const previousOrgId = useRef<string | null>(null);

  // Layout effect installs auth before React Query starts requests in passive effects.
  useLayoutEffect(() => {
    setApiAccessTokenProvider(getToken);

    if (previousOrgId.current && previousOrgId.current !== orgId) {
      queryClient.clear();
    }
    previousOrgId.current = orgId;

    return () => setApiAccessTokenProvider(undefined);
  }, [getToken, orgId, queryClient]);

  return children;
}
