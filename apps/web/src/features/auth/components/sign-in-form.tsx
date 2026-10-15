import { useSignIn } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowBackIcon } from "@/components/ui/icons";
import { TextField } from "@/components/ui/text-field";
import { AUTH_PATH, enterApp, rememberDestination } from "@/features/auth/auth-routes";
import { EMAIL_PATTERN, messageOf } from "@/features/auth/auth-rules";
import {
  AuthError,
  AuthWaiting,
  GoogleButton,
  OrDivider,
} from "@/features/auth/components/auth-parts";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";

type Step = "start" | "code" | "redirecting";

/**
 * Sign in (prototype `signinPage`): Google, or a work email that gets a one-time code. These are
 * the methods enabled in Clerk; password sign-in and company SSO are off. Built on Clerk's
 * `useSignIn()` so the page is ours, not Clerk's prebuilt form.
 */
export function SignInForm({ onCreateAccount }: { onCreateAccount: (email: string) => void }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  const continueWithGoogle = async () => {
    setProblem(null);
    rememberDestination();
    setStep("redirecting");
    const { error } = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: AUTH_PATH["sso-callback"],
    });
    if (error) {
      setStep("start");
      setProblem(messageOf(error));
    }
  };

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const emailAddress = email.trim();
    if (!EMAIL_PATTERN.test(emailAddress)) {
      setProblem("Enter your work email.");
      return;
    }
    setProblem(null);
    const { error } = await signIn.emailCode.sendCode({ emailAddress });
    if (!error) setStep("code");
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (error) return;
    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: ({ decorateUrl }) => enterApp(decorateUrl) });
    } else {
      // Second factors and new-device checks are off in Clerk; say so rather than stall.
      setProblem("Your account needs another sign-in step. Ask your IT team for help.");
    }
  };

  const resend = async () => {
    setProblem(null);
    setCode("");
    await signIn.emailCode.sendCode();
  };

  if (step === "redirecting") {
    return (
      <SignInLayout title="Sign in">
        <AuthWaiting title="Signing you in with Google…">
          You'll come back here once Google confirms it's you.
        </AuthWaiting>
      </SignInLayout>
    );
  }

  if (step === "code") {
    return (
      <SignInLayout
        title="Check your email"
        description={
          <>
            We sent a 6-digit code to <b className="font-medium text-on-surface">{email.trim()}</b>.
          </>
        }
      >
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          <TextField
            inputSize="compact"
            label="Code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            error={problem ?? messageOf(errors.fields.code)}
          />
          <AuthError message={messageOf(errors.global?.[0])} />
          <Button
            type="submit"
            size="md"
            className="h-12 w-full"
            disabled={busy || code.length < 6}
          >
            Sign in
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setStep("start");
              setCode("");
              setProblem(null);
            }}
          >
            <ArrowBackIcon aria-hidden /> Use another email
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void resend()}>
            Send a new code
          </Button>
        </div>
      </SignInLayout>
    );
  }

  const identifierError = errors.fields.identifier;
  const noAccount = identifierError?.code === "form_identifier_not_found";

  return (
    <SignInLayout title="Sign in" description="Use your work account.">
      <GoogleButton disabled={busy} onClick={() => void continueWithGoogle()}>
        Continue with Google
      </GoogleButton>
      <OrDivider />
      <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
        <TextField
          inputSize="compact"
          label="Work email"
          type="email"
          autoComplete="username"
          placeholder="name@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          supporting="We'll email you a code to sign in."
          error={
            problem ??
            (noAccount ? "There's no account with this email yet." : messageOf(identifierError))
          }
        />
        {noAccount ? (
          <Button
            type="button"
            variant="outline"
            size="md"
            className="h-12 w-full"
            onClick={() => onCreateAccount(email.trim())}
          >
            Create an account with this email
          </Button>
        ) : null}
        <AuthError message={messageOf(errors.global?.[0])} />
        <Button type="submit" variant="secondary" size="md" className="h-12 w-full" disabled={busy}>
          Continue
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-xs text-on-surface-variant">
        <p>
          New to ContextOS?{" "}
          <Button
            variant="link"
            className="h-auto p-0 align-baseline text-xs"
            onClick={() => onCreateAccount(email.trim())}
          >
            Create an account
          </Button>
        </p>
        <p>Trouble signing in? Ask your IT team.</p>
      </div>
    </SignInLayout>
  );
}
