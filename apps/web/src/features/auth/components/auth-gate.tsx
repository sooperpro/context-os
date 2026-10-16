import type { SessionState, SessionWorkspace } from "@contextos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { AddIcon, LogoutIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { selectWorkspace, signOut } from "@/features/auth/api/auth.api";
import { authKeys, sessionQuery } from "@/features/auth/api/auth.queries";
import { RESET_PASSWORD_PATH } from "@/features/auth/api/auth.api";
import { ResetPasswordScreen } from "@/features/auth/components/reset-password-screen";
import { SignInForm, SignInScreen } from "@/features/auth/components/sign-in-form";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";
import { createWorkspace } from "@/features/workspace/api/workspace.api";
import { ApiClientError } from "@/lib/api-client";

/**
 * Blocks application data loading until there is a signed-in session with an active workspace it may
 * use. Development mode (no sign-in) passes straight through with the local actor.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useQuery(sessionQuery());

  // Development-only pages (the UI gallery) need no session and make no API calls.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/")) {
    return children;
  }

  // A password reset link works whether or not someone is signed in on this browser.
  if (window.location.pathname === RESET_PASSWORD_PATH) return <ResetPasswordScreen />;

  if (session.isPending) {
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

  if (session.isError) {
    const signedOut = session.error instanceof ApiClientError && session.error.status === 401;
    return signedOut ? (
      <SignInScreen />
    ) : (
      <SignInLayout title="Sign in" description="ContextOS couldn't be reached.">
        <Banner tone="error" title="Something went wrong" description={session.error.message} />
        <Button onClick={() => void session.refetch()}>Try again</Button>
      </SignInLayout>
    );
  }

  const state = session.data;
  const active = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
  if (!active) return <WorkspacePicker state={state} />;
  if (active.ssoRequired)
    return (
      <SignInLayout
        title="Use company sign-in"
        description={`${active.name} requires your company's single sign-on.`}
      >
        <SignInForm ssoOnly />
        <SignOutButton />
      </SignInLayout>
    );
  return children;
}

function SignOutButton() {
  const out = useMutation({
    mutationFn: signOut,
    onSuccess: () => window.location.assign("/"),
  });
  return (
    <Button
      variant="ghost"
      className="self-center"
      disabled={out.isPending}
      onClick={() => out.mutate()}
    >
      <LogoutIcon aria-hidden /> Sign out
    </Button>
  );
}

/** Choose one of your workspaces, or create one (you become its owner). */
function WorkspacePicker({ state }: { state: SessionState }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(state.workspaces.length === 0);
  const choose = useMutation({
    mutationFn: (workspace: SessionWorkspace) => selectWorkspace(workspace.id),
    onSuccess: (next) => {
      // Drop what was cached outside a workspace, but keep the session query itself: clearing it
      // would leave this gate watching a removed query, so choosing would appear to do nothing.
      const session = JSON.stringify(authKeys.session());
      queryClient.removeQueries({
        predicate: (query) => JSON.stringify(query.queryKey) !== session,
      });
      queryClient.setQueryData(authKeys.session(), next);
    },
  });

  return (
    <SignInLayout
      title={creating ? "Create your workspace" : "Choose your workspace"}
      description={
        creating
          ? "A workspace holds your company's projects, sources and people. Invite your team next."
          : `Signed in as ${state.user.email ?? state.user.name}.`
      }
    >
      {creating ? (
        <CreateWorkspaceForm
          onCancel={state.workspaces.length ? () => setCreating(false) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-0.5">
            {state.workspaces.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(workspace)}
                  className="flex w-full items-center gap-3 rounded-xs bg-pane px-4 py-3 text-left transition-colors hover:bg-surface-container-high focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{workspace.name}</span>
                    <span className="text-xs text-on-surface-variant capitalize">
                      {workspace.role}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> Create a workspace
          </Button>
        </div>
      )}
      {state.workspaces.length === 0 ? (
        <p className="text-xs text-on-surface-variant">
          {state.signInMethod === "microsoft" || state.signInMethod === "google"
            ? // An invitation is accepted only for an address the provider confirmed; Microsoft
              // often doesn't, so an email link (which proves the address) accepts it.
              `Invited to your team? Sign out and sign in once with an email link to ${state.user.email ?? "your address"}: that accepts the invitation.`
            : `Joining your team instead? Ask an admin to invite ${state.user.email ?? "you"}, then sign in again.`}
        </p>
      ) : null}
      <SignOutButton />
    </SignInLayout>
  );
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

function CreateWorkspaceForm({ onCancel }: { onCancel?: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const create = useMutation({
    mutationFn: () => createWorkspace({ name: name.trim(), slug }),
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
    onError: () => undefined,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {create.isError ? (
        <Banner
          tone="error"
          title="Couldn't create the workspace"
          description={create.error.message}
        />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Company or team name</Label>
        <Input
          id="workspace-name"
          required
          maxLength={200}
          placeholder="Acme"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workspace-slug">Workspace address</Label>
        <Input
          id="workspace-slug"
          required
          minLength={3}
          maxLength={63}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="Lowercase letters, numbers and single hyphens"
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
        />
      </div>
      <Button type="submit" disabled={create.isPending || !name.trim() || slug.length < 3}>
        {create.isPending ? <Spinner className="size-4" /> : null} Create workspace
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back to your workspaces
        </Button>
      ) : null}
    </form>
  );
}
