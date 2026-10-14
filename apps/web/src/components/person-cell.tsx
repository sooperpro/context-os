import type { PersonRef } from "@contextos/shared";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PersonAvatar } from "@/components/ui/avatar";

/**
 * A person in a table row (prototype `.person-cell`): small avatar, name, and a line such as
 * "Account Executive · Sales". With `to`, the name links to their record.
 */
export function PersonCell({
  person,
  meta,
  to,
}: {
  person: Pick<PersonRef, "id" | "name">;
  meta?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <PersonAvatar person={person} size="sm" />
      <span className="flex min-w-0 flex-col">
        <b className="text-sm font-medium">{person.name}</b>
        {meta ? <span className="text-xs text-on-surface-variant">{meta}</span> : null}
      </span>
    </>
  );
  return to ? (
    <Link
      to={to}
      className="flex items-center gap-3 text-on-surface no-underline hover:[&_b]:underline"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3">{body}</div>
  );
}
