import type { PersonRef } from "@contextos/shared";
import type { ReactNode } from "react";
import { PersonAvatar } from "@/components/ui/avatar";

/**
 * A person's page header (prototype `.profile-hero`): the large avatar, chips above the name, a line
 * about them, then optional extras (meta chips, a review track) and actions. Profiles, a manager's
 * member page and People Ops' records all open with it.
 */
export function ProfileHero({
  person,
  chips,
  subtitle,
  children,
  actions,
}: {
  person: Pick<PersonRef, "id" | "name">;
  chips?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start gap-4 px-1 pt-2 @min-[640px]:flex-row @min-[640px]:gap-7">
      <PersonAvatar
        person={person}
        size="xl"
        className="size-22 text-3xl @min-[640px]:size-30 @min-[640px]:text-[40px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {chips ? <span className="flex flex-wrap items-center gap-1.5">{chips}</span> : null}
        <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight medium:text-[32px] medium:leading-10">
          {person.name}
        </h1>
        {subtitle ? <p className="text-base">{subtitle}</p> : null}
        {children}
        {actions ? <div className="mt-1 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
