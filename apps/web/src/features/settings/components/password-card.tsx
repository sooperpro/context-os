import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { savePassword } from "@/features/auth/api/auth.api";
import { authKeys, sessionQuery } from "@/features/auth/api/auth.queries";

/**
 * Settings › Security (N-17): change the password with the current one, or add one when the account
 * signs in with Google, Microsoft or an email link. Either way a security email goes out.
 */
export function PasswordCard() {
  const ids = { current: useId(), next: useId(), repeat: useId(), others: useId() };
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery());
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [others, setOthers] = useState(true);
  const save = useMutation({
    mutationFn: savePassword,
    onSuccess: async (result) => {
      toast.success(
        result.password === "added"
          ? "Password added. You can now sign in with your email and password."
          : "Password changed",
      );
      setCurrent("");
      setNext("");
      setRepeat("");
      await queryClient.invalidateQueries({ queryKey: authKeys.all });
    },
    onError: (error) => toast.error(error.message),
  });
  if (session?.authentication !== "accounts") return null;
  const hasPassword = session.linkedMethods.includes("password");
  const mismatch = repeat.length > 0 && repeat !== next;
  const ready = next.length >= 8 && next === repeat && (!hasPassword || current.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasPassword ? "Change password" : "Add a password"}</CardTitle>
        <CardDescription>
          {hasPassword
            ? "Enter your current password, then the new one. We’ll email you to confirm the change."
            : "Sign in with your email and a password as well as your current method. We’ll email you to confirm."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            save.mutate({
              ...(hasPassword ? { currentPassword: current } : {}),
              newPassword: next,
              signOutOtherDevices: others,
            });
          }}
        >
          {hasPassword ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.current}>Current password</Label>
              <Input
                id={ids.current}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.next}>{hasPassword ? "New password" : "Password"}</Label>
            <Input
              id={ids.next}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <span className="text-xs text-on-surface-variant">At least 8 characters.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.repeat}>Repeat it</Label>
            <Input
              id={ids.repeat}
              type="password"
              autoComplete="new-password"
              aria-invalid={mismatch}
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
            {mismatch ? (
              <span className="text-xs text-destructive">The passwords don’t match.</span>
            ) : null}
          </div>
          <label htmlFor={ids.others} className="flex items-center justify-between gap-3 text-sm">
            Sign out on my other devices
            <Switch id={ids.others} checked={others} onCheckedChange={setOthers} />
          </label>
          <div>
            <Button type="submit" disabled={!ready || save.isPending}>
              {hasPassword ? "Change password" : "Add password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
