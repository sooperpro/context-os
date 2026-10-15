import { HandleSSOCallback, OrganizationList, useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  enterApp,
  isAuthPath,
  rememberDestination,
  useAuthView,
} from "@/features/auth/auth-routes";
import { AuthWaiting } from "@/features/auth/components/auth-parts";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { setApiAccessTokenProvider } from "@/lib/api-client";

/**
 * Blocks application data loading until Clerk has a signed-in user and active organization.
 * Signed out, it shows our sign-in (any path), sign-up (`/sign-up`) or the Google return
 * (`/sso-callback`). A session waiting on its workspace counts as signed in here, so the person
 * goes on to choose one instead of back to sign-in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, orgId } = useAuth({ treatPendingAsSignedOut: false });
  const [view, go] = useAuthView();
  const [prefillEmail, setPrefillEmail] = useState("");
  const onAuthPage = isAuthPath(window.location.pathname);

  // Remember a shared link opened while signed out, so signing in lands on it.
  useEffect(() => {
    if (isLoaded && !isSignedIn) rememberDestination();
  }, [isLoaded, isSignedIn]);

  // Signed in on a sign-in page (the back button, an old tab): go to the app.
  useEffect(() => {
    if (isLoaded && isSignedIn && orgId && onAuthPage) enterApp();
  }, [isLoaded, isSignedIn, orgId, onAuthPage]);

  // Development-only pages (the UI gallery) need no session and make no API calls.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/")) {
    return children;
  }

  if (!isLoaded) {
    return (
      <SignInLayout title="Sign in" description="Checking your session…">
        <div
          className="flex items-center justify-center py-10"
          role="status"
          aria-label="Loading authentication"
        >
          <Spinner className="size-6" />
        </div>
      </SignInLayout>
    );
  }

  if (!isSignedIn) {
    if (view === "sso-callback") {
      return (
        <SignInLayout title="Signing you in">
          <AuthWaiting title="Finishing with Google…" />
          <HandleSSOCallback
            navigateToApp={({ decorateUrl }) => enterApp(decorateUrl)}
            navigateToSignIn={() => go("sign-in")}
            navigateToSignUp={() => go("sign-up")}
          />
        </SignInLayout>
      );
    }
    if (view === "sign-up") {
      return <SignUpForm initialEmail={prefillEmail} onSignIn={() => go("sign-in")} />;
    }
    return (
      <SignInForm
        onCreateAccount={(email) => {
          setPrefillEmail(email);
          go("sign-up");
        }}
      />
    );
  }

  if (!orgId) {
    return (
      <SignInLayout
        title="Choose your workspace"
        description="Select an organization or create one to continue to ContextOS."
      >
        <OrganizationList
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
        />
      </SignInLayout>
    );
  }

  if (onAuthPage) {
    return (
      <SignInLayout title="Signing you in">
        <AuthWaiting title="Opening ContextOS…" />
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
