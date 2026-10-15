import { useSignUp } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowBackIcon, VisibilityIcon, VisibilityOffIcon } from "@/components/ui/icons";
import { TextField } from "@/components/ui/text-field";
import { AUTH_PATH, enterApp, rememberDestination } from "@/features/auth/auth-routes";
import { EMAIL_PATTERN, messageOf, PASSWORD_MIN_LENGTH } from "@/features/auth/auth-rules";
import {
  AuthError,
  AuthWaiting,
  GoogleButton,
  OrDivider,
} from "@/features/auth/components/auth-parts";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";

type Step = "details" | "code" | "redirecting";

/**
 * Create an account, in the sign-in frame: Google, or name, work email and a password, then the
 * code Clerk emails to confirm the address. After that the person chooses (or creates) their
 * workspace, as after signing in.
 */
export function SignUpForm({
  initialEmail = "",
  onSignIn,
}: {
  initialEmail?: string;
  onSignIn: () => void;
}) {
  const { signUp, errors, fetchStatus } = useSignUp();
  const [step, setStep] = useState<Step>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [problems, setProblems] = useState<{ email?: string; password?: string; code?: string }>(
    {},
  );
  const busy = fetchStatus === "fetching";

  const continueWithGoogle = async () => {
    rememberDestination();
    setStep("redirecting");
    const { error } = await signUp.sso({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: AUTH_PATH["sso-callback"],
    });
    if (error) setStep("details");
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const emailAddress = email.trim();
    const found = {
      email: EMAIL_PATTERN.test(emailAddress) ? undefined : "Enter your work email.",
      password:
        password.length >= PASSWORD_MIN_LENGTH
          ? undefined
          : `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
    setProblems(found);
    if (found.email || found.password) return;
    const { error } = await signUp.password({
      emailAddress,
      password,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
    if (error) return;
    const sent = await signUp.verifications.sendEmailCode();
    if (!sent.error) setStep("code");
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setProblems({});
    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (error) return;
    if (signUp.status === "complete") {
      await signUp.finalize({ navigate: ({ decorateUrl }) => enterApp(decorateUrl) });
    } else {
      setProblems({ code: "Your account needs more details before you can sign in." });
    }
  };

  if (step === "redirecting") {
    return (
      <SignInLayout title="Create your account">
        <AuthWaiting title="Signing you up with Google…">
          You'll come back here once Google confirms it's you.
        </AuthWaiting>
      </SignInLayout>
    );
  }

  if (step === "code") {
    return (
      <SignInLayout
        title="Confirm your email"
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
            error={problems.code ?? messageOf(errors.fields.code)}
          />
          <AuthError message={messageOf(errors.global?.[0])} />
          <Button
            type="submit"
            size="md"
            className="h-12 w-full"
            disabled={busy || code.length < 6}
          >
            Create account
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setStep("details");
              setCode("");
            }}
          >
            <ArrowBackIcon aria-hidden /> Change details
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void signUp.verifications.sendEmailCode()}
          >
            Send a new code
          </Button>
        </div>
      </SignInLayout>
    );
  }

  return (
    <SignInLayout title="Create your account" description="Use your work email.">
      <GoogleButton disabled={busy} onClick={() => void continueWithGoogle()}>
        Sign up with Google
      </GoogleButton>
      <OrDivider />
      <form onSubmit={create} className="flex flex-col gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            inputSize="compact"
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={messageOf(errors.fields.firstName)}
          />
          <TextField
            inputSize="compact"
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={messageOf(errors.fields.lastName)}
          />
        </div>
        <TextField
          inputSize="compact"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={problems.email ?? messageOf(errors.fields.emailAddress)}
        />
        <TextField
          inputSize="compact"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          supporting={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easiest to remember.`}
          error={problems.password ?? messageOf(errors.fields.password)}
          trailing={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-on-surface-variant"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </Button>
          }
        />
        <AuthError message={messageOf(errors.global?.[0])} />
        {/* Clerk's bot protection mounts here when the instance turns it on. */}
        <div id="clerk-captcha" />
        <Button type="submit" size="md" className="h-12 w-full" disabled={busy}>
          Create account
        </Button>
      </form>
      <p className="text-xs text-on-surface-variant">
        Already have an account?{" "}
        <Button variant="link" className="h-auto p-0 align-baseline text-xs" onClick={onSignIn}>
          Sign in
        </Button>
      </p>
    </SignInLayout>
  );
}
