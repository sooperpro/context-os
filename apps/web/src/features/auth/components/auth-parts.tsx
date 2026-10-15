import type { ReactNode } from "react";
import { ConnectorLogo } from "@/components/connector-logo";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorFilledIcon } from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";

/** The prototype's Google button: filled, 56px, the logo on a round white tile at the start. */
export function GoogleButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="md"
      className="h-12 w-full justify-start gap-3 ps-2 pe-6"
      disabled={disabled}
      onClick={onClick}
    >
      <ConnectorLogo provider="google" className="size-8 rounded-full shadow-none" />
      {children}
    </Button>
  );
}

/** "or" between the Google button and the email form (prototype `.fr-or`). */
export function OrDivider() {
  return (
    <p className="flex items-center gap-3 text-xs text-on-surface-variant before:h-px before:flex-1 before:bg-outline-variant after:h-px after:flex-1 after:bg-outline-variant">
      or
    </p>
  );
}

/** While another site confirms who they are (prototype `.auth-wait`). */
export function AuthWaiting({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader contained label={title} />
      <p className="text-base font-medium">{title}</p>
      {children ? <p className="text-sm text-on-surface-variant">{children}</p> : null}
    </div>
  );
}

/** Errors that belong to no field (a rate limit, a lost connection). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Banner tone="error" icon={<ErrorFilledIcon />} title={message} />;
}
