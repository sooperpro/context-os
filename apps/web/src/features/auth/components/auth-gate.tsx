import { OrganizationList, SignIn, useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";
import { setApiAccessTokenProvider } from "@/lib/api-client";

/** Blocks application data loading until Clerk has a signed-in user and active organization. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, orgId } = useAuth();

  // Development-only pages (the UI gallery) need no session and make no API calls.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/")) {
    return children;
  }

  if (!isLoaded) {
    return (
      <SignInLayout title="Sign in" description="Checking your session…">
        <div className="flex items-center justify-center py-10" role="status" aria-label="Loading authentication">
          <Spinner className="size-6" />
        </div>
      </SignInLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInLayout title="Sign in" description="Use your work account.">
        <SignIn routing="hash" />
      </SignInLayout>
    );
  }

  if (!orgId) {
    return (
      <SignInLayout
        title="Choose your workspace"
        description="Select an organization or create one to continue to ContextOS."
      >
        <OrganizationList hidePersonal afterCreateOrganizationUrl="/" afterSelectOrganizationUrl="/" />
      </SignInLayout>
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
