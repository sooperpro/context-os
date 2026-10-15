import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { ConnectorLogo } from "@/components/connector-logo";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  ArrowBackIcon,
  DomainIcon,
  LoginIcon,
  MailIcon,
  PersonAddIcon,
  VisibilityIcon,
  VisibilityOffIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  requestPasswordReset,
  sendMagicLink,
  SignInError,
  signInWithPassword,
  signInWithProvider,
  signInWithSso,
  signUpWithPassword,
} from "@/features/auth/api/auth.api";
import { authKeys, authOptionsQuery } from "@/features/auth/api/auth.queries";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";

/** Messages for `?error=<CODE>` when a sign-in comes back unsuccessful. */
const RETURN_ERRORS: Record<string, string> = {
  INVALID_TOKEN: "That link was already used or is invalid. Request a new one.",
  EXPIRED_TOKEN: "That sign-in link has expired. Request a new one.",
  TOKEN_EXPIRED: "That link has expired. Request a new one.",
  ATTEMPTS_EXCEEDED: "That sign-in link was already used. Request a new one.",
  EMAIL_DOMAIN_MISMATCH: "Your company's sign-in returned an email outside its verified domain.",
  account_not_linked:
    "That account's email is already registered. Sign in with an email link first.",
};

/** Clearer wording for the sign-in errors people can fix themselves, by code. */
const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD:
    "That email and password don't match. Try again, or choose “Forgot password?”.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
  PASSWORD_TOO_LONG: "Use at most 128 characters for your password.",
  INVALID_EMAIL: "Enter a valid email address.",
};

const errorText = (error: Error) =>
  (error instanceof SignInError && error.code ? FRIENDLY_ERRORS[error.code] : undefined) ??
  error.message;

/** The `?email=` from an invitation, `?error=` from a failed sign-in and `?mode=sign-up`, read once. */
function readReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  return {
    email: params.get("email") ?? "",
    error: error ? (RETURN_ERRORS[error] ?? "Sign-in didn't complete. Please try again.") : null,
    signUp: params.get("mode") === "sign-up",
  };
}

export type SignInView = "sign-in" | "sign-up" | "sso" | "forgot";

const COPY: Record<SignInView, { title: string; description: string }> = {
  "sign-in": { title: "Sign in", description: "Welcome back. Use your work email or account." },
  "sign-up": {
    title: "Create your account",
    description: "Use your work email. Invited to a team? Use the address the invitation went to.",
  },
  sso: { title: "Sign in", description: "Continue with your company's single sign-on." },
  forgot: {
    title: "Reset your password",
    description: "We'll email you a link to choose a new password.",
  },
};

/** The signed-out screen: sign in, create an account, or reset a password. */
export function SignInScreen() {
  const [view, setView] = useState<SignInView>(() =>
    readReturnParams().signUp ? "sign-up" : "sign-in",
  );
  return (
    <SignInLayout title={COPY[view].title} description={COPY[view].description}>
      <SignInForm view={view} onViewChange={setView} />
    </SignInLayout>
  );
}

type Sent = { kind: "link" | "confirm" | "reset"; to: string };

const SENT_COPY: Record<Sent["kind"], (to: string) => { title: string; description: string }> = {
  link: (to) => ({
    title: "Check your email",
    description: `We sent a sign-in link to ${to}. It works once and expires in 15 minutes.`,
  }),
  confirm: (to) => ({
    title: "Confirm your email",
    description: `We sent a link to ${to}. Open it to finish setting up your account; it expires in 24 hours. Can't find it? Check spam, or sign in with your password to get a new one.`,
  }),
  reset: (to) => ({
    title: "Check your email",
    description: `If ${to} has a ContextOS account, we sent it a link to choose a new password. The link expires in 1 hour.`,
  }),
};

/**
 * Sign in or sign up: email and password (confirmed by email), a one-time email link, Google or
 * Microsoft, or the company's SSO (found by email domain). Methods the deployment hasn't configured
 * are hidden. `ssoOnly` is for a workspace that requires company SSO.
 */
export function SignInForm({
  ssoOnly = false,
  view: controlledView,
  onViewChange,
}: {
  ssoOnly?: boolean;
  view?: SignInView;
  onViewChange?: (view: SignInView) => void;
}) {
  const queryClient = useQueryClient();
  const [initial] = useState(readReturnParams);
  const [ownView, setOwnView] = useState<SignInView>(ssoOnly ? "sso" : "sign-in");
  const view = ssoOnly ? "sso" : (controlledView ?? ownView);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const options = useQuery(authOptionsQuery());
  const methods = options.data?.methods;
  const passwords = methods?.password ?? false;

  const magicLink = useMutation({
    mutationFn: sendMagicLink,
    onSuccess: (_, address) => setSent({ kind: "link", to: address }),
    onError: () => undefined,
  });
  const social = useMutation({ mutationFn: signInWithProvider, onError: () => undefined });
  const sso = useMutation({ mutationFn: signInWithSso, onError: () => undefined });
  const passwordSignIn = useMutation({
    mutationFn: signInWithPassword,
    // The gate reads the new session and opens the app.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.session() }),
    onError: (error, input) => {
      // Right password, address not confirmed yet: the server just sent the confirmation again.
      if (error instanceof SignInError && error.code === "EMAIL_NOT_VERIFIED")
        setSent({ kind: "confirm", to: input.email });
    },
  });
  const signUp = useMutation({
    mutationFn: signUpWithPassword,
    onSuccess: (_, input) => setSent({ kind: "confirm", to: input.email }),
    onError: () => undefined,
  });
  const forgot = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: (_, address) => setSent({ kind: "reset", to: address }),
    onError: () => undefined,
  });
  const all = [magicLink, social, sso, passwordSignIn, signUp, forgot];
  const failure = all.find((mutation) => mutation.error && !sent)?.error ?? null;
  const busy = all.some((mutation) => mutation.isPending);

  const switchTo = (next: SignInView) => {
    for (const mutation of all) mutation.reset();
    setSent(null);
    setPassword("");
    if (onViewChange) onViewChange(next);
    else setOwnView(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (view === "sso") sso.mutate(address);
    else if (view === "forgot") forgot.mutate(address);
    else if (view === "sign-up")
      signUp.mutate({ name: name.trim() || address, email: address, password });
    else if (passwords) passwordSignIn.mutate({ email: address, password });
    else magicLink.mutate(address);
  };

  /** "Email me a sign-in link instead": the address only, whatever is in the password field. */
  const sendLink = () => {
    if (!emailField.current?.reportValidity()) return;
    magicLink.mutate(email.trim());
  };

  if (options.isPending)
    return (
      <div
        className="flex items-center justify-center py-10"
        role="status"
        aria-label="Loading sign-in"
      >
        <Spinner className="size-6" />
      </div>
    );

  if (sent) {
    const copy = SENT_COPY[sent.kind](sent.to);
    return (
      <div className="flex flex-col gap-4">
        <Banner
          tone="success"
          icon={<MailIcon aria-hidden />}
          title={copy.title}
          description={copy.description}
        />
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => (sent.kind === "link" ? setSent(null) : switchTo("sign-in"))}
        >
          <ArrowBackIcon aria-hidden />
          {sent.kind === "link" ? "Use a different email" : "Back to sign in"}
        </Button>
      </div>
    );
  }

  const withPassword = passwords && (view === "sign-in" || view === "sign-up");
  const submitLabel = {
    "sign-in": passwords ? "Sign in" : "Email me a sign-in link",
    "sign-up": "Create account",
    sso: "Continue with company SSO",
    forgot: "Email me a reset link",
  }[view];
  const submitIcon = {
    "sign-in": passwords ? <LoginIcon aria-hidden /> : <MailIcon aria-hidden />,
    "sign-up": <PersonAddIcon aria-hidden />,
    sso: <DomainIcon aria-hidden />,
    forgot: <MailIcon aria-hidden />,
  }[view];

  return (
    <div className="flex flex-col gap-4">
      {failure || initial.error ? (
        <Banner
          tone="error"
          title={view === "sign-up" ? "Couldn't create your account" : "Couldn't sign you in"}
          description={failure ? errorText(failure) : (initial.error ?? "")}
        />
      ) : null}

      {(view === "sign-in" || view === "sign-up") && (methods?.google || methods?.microsoft) ? (
        <div className="flex flex-col gap-2">
          {methods.google ? (
            <Button variant="outline" disabled={busy} onClick={() => social.mutate("google")}>
              <ConnectorLogo provider="google" size="sm" /> Continue with Google
            </Button>
          ) : null}
          {methods.microsoft ? (
            <Button variant="outline" disabled={busy} onClick={() => social.mutate("microsoft")}>
              <ConnectorLogo provider="microsoft" size="sm" /> Continue with Microsoft
            </Button>
          ) : null}
          <div className="flex items-center gap-3 py-1 text-xs text-on-surface-variant">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-3">
        {view === "sign-up" ? (
          <div className="space-y-2">
            <Label htmlFor="sign-in-name">Your name</Label>
            <Input
              id="sign-in-name"
              required
              autoComplete="name"
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="sign-in-email">Work email</Label>
          <Input
            ref={emailField}
            id="sign-in-email"
            type="email"
            required
            autoComplete={view === "sign-up" ? "username" : "email"}
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {withPassword ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="sign-in-password">Password</Label>
              {view === "sign-in" ? (
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                  onClick={() => switchTo("forgot")}
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <div className="relative">
              <Input
                id="sign-in-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={view === "sign-up" ? 8 : undefined}
                maxLength={128}
                autoComplete={view === "sign-up" ? "new-password" : "current-password"}
                className="pr-14"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={view === "sign-up" ? "sign-in-password-hint" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-2 -translate-y-1/2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <VisibilityOffIcon aria-hidden /> : <VisibilityIcon aria-hidden />}
              </Button>
            </div>
            {view === "sign-up" ? (
              <p id="sign-in-password-hint" className="text-xs text-on-surface-variant">
                At least 8 characters. A short phrase is easier to remember.
              </p>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner className="size-4" /> : submitIcon}
          {submitLabel}
        </Button>
      </form>

      {view === "sign-in" && passwords && methods?.email ? (
        <Button variant="outline" disabled={busy} onClick={sendLink}>
          <MailIcon aria-hidden /> Email me a sign-in link instead
        </Button>
      ) : null}

      {ssoOnly ? null : (
        <div className="flex flex-col items-center gap-1">
          {view === "sign-in" && methods?.sso ? (
            <Button variant="ghost" onClick={() => switchTo("sso")}>
              Use company single sign-on
            </Button>
          ) : null}
          {view === "sso" || view === "forgot" ? (
            <Button variant="ghost" onClick={() => switchTo("sign-in")}>
              <ArrowBackIcon aria-hidden /> Back to sign in
            </Button>
          ) : null}
          {view === "sign-in" && passwords ? (
            <p className="text-sm text-on-surface-variant">
              New to ContextOS?{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={() => switchTo("sign-up")}
              >
                Create an account
              </button>
            </p>
          ) : null}
          {view === "sign-up" ? (
            <p className="text-sm text-on-surface-variant">
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={() => switchTo("sign-in")}
              >
                Sign in
              </button>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
