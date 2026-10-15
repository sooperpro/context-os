import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { CheckIcon, LoginIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { resetPassword, SignInError } from "@/features/auth/api/auth.api";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";

/** The token from the reset link, read once and then taken out of the address bar and history. */
function readResetLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (params.has("token")) window.history.replaceState(null, "", window.location.pathname);
  return { token: params.get("error") ? null : token };
}

/** Back to the app root, where the sign-in screen picks up. */
const toSignIn = () => window.location.replace("/");

/** Where a password reset link lands: choose a new password, then sign in with it. */
export function ResetPasswordScreen() {
  const [{ token }] = useState(readResetLink);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const reset = useMutation({ mutationFn: resetPassword, onError: () => undefined });
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!token || mismatch) return;
    reset.mutate({ token, newPassword: password });
  };

  if (!token)
    return (
      <SignInLayout title="Reset your password" description="This link can't be used.">
        <Banner
          tone="error"
          title="That reset link has expired or was already used"
          description="Request a new one: choose “Forgot password?” on the sign-in page."
        />
        <Button onClick={toSignIn}>
          <LoginIcon aria-hidden /> Go to sign in
        </Button>
      </SignInLayout>
    );

  if (reset.isSuccess)
    return (
      <SignInLayout title="Password updated" description="Sign in with your new password.">
        <Banner
          tone="success"
          icon={<CheckIcon aria-hidden />}
          title="Your password was changed"
          description="For your security, you were signed out on every device."
        />
        <Button onClick={toSignIn}>
          <LoginIcon aria-hidden /> Sign in
        </Button>
      </SignInLayout>
    );

  const failure = reset.error
    ? reset.error instanceof SignInError && reset.error.code === "INVALID_TOKEN"
      ? "That reset link has expired or was already used. Request a new one from the sign-in page."
      : reset.error.message
    : null;

  return (
    <SignInLayout title="Choose a new password" description="Use at least 8 characters.">
      {failure ? (
        <Banner tone="error" title="Couldn't change your password" description={failure} />
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            required
            maxLength={128}
            autoComplete="new-password"
            value={confirm}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "confirm-password-error" : undefined}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch ? (
            <p id="confirm-password-error" className="text-xs text-error">
              The passwords don't match.
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={reset.isPending || mismatch}>
          {reset.isPending ? <Spinner className="size-4" /> : null}
          Save new password
        </Button>
      </form>
      <Button variant="ghost" className="self-center" onClick={toSignIn}>
        Back to sign in
      </Button>
    </SignInLayout>
  );
}
