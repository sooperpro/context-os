import type { DirectoryPerson, DirectoryTeam, PersonRef } from "@contextos/shared";
import { cn } from "cn";
import { Link } from "react-router";
import { AvatarGroup, PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LocationOnIcon } from "@/components/ui/icons";
import { MetaChip } from "@/components/ui/meta-chip";
import { Shape } from "@/components/ui/shape";
import {
  TEAM_AREA_ICON,
  peoplePath,
  personBadges,
  roleAndTeam,
} from "@/features/people/people-meta";
import { formatCount, formatTimeZone } from "@/lib/format";

export function PersonBadges({
  person,
  className,
}: {
  person: DirectoryPerson;
  className?: string;
}) {
  const badges = personBadges(person);
  if (badges.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {badges.map((badge) => (
        <Badge key={badge.label} variant={badge.tone}>
          {badge.label}
        </Badge>
      ))}
    </span>
  );
}

/** A person in the directory grid (prototype `.person-card`). */
export function PersonCard({ person }: { person: DirectoryPerson }) {
  return (
    <Link
      to={peoplePath(person.id)}
      className="flex w-full min-w-0 flex-col gap-1 rounded-card bg-card p-4 text-on-surface no-underline transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none hover:rounded-3xl hover:shadow-elevation-1 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="mb-2 flex items-start justify-between gap-2">
        <PersonAvatar person={person} size="lg" />
        <PersonBadges person={person} className="justify-end" />
      </span>
      <b className="text-base font-medium">{person.name}</b>
      <span className="text-xs text-on-surface-variant">{roleAndTeam(person)}</span>
      {person.skills.length ? (
        <span className="my-2 flex flex-wrap gap-1">
          {person.skills.slice(0, 3).map((skill) => (
            <MetaChip key={skill} tone="outline">
              {skill}
            </MetaChip>
          ))}
        </span>
      ) : null}
      {person.location ? (
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-on-surface-variant">
          <LocationOnIcon className="size-4" aria-hidden />
          {person.location}
          {person.timeZone ? ` · ${formatTimeZone(person.timeZone)}` : ""}
        </span>
      ) : null}
    </Link>
  );
}

/** A person as an org-chart node (prototype `.org-node`); `emphasis` marks the lead or the profile owner. */
export function OrgNode({
  person,
  size = "sm",
  emphasis = false,
  badges,
}: {
  person: PersonRef;
  size?: "xs" | "sm" | "md";
  emphasis?: boolean;
  badges?: DirectoryPerson;
}) {
  const body = (
    <>
      <PersonAvatar person={person} size={size} />
      <span className="flex min-w-0 flex-col">
        <b className="truncate text-sm font-medium">{person.name}</b>
        {person.title ? <span className="truncate text-xs opacity-80">{person.title}</span> : null}
      </span>
      {badges ? <PersonBadges person={badges} className="ms-auto" /> : null}
    </>
  );
  const className = cn(
    "flex min-w-0 items-center gap-2.5 rounded-lg bg-pane py-2 pr-3 pl-2 text-on-surface no-underline",
    emphasis && "bg-secondary-container text-on-secondary-container",
  );
  return emphasis && !badges ? (
    <div className={className}>{body}</div>
  ) : (
    <Link
      to={peoplePath(person.id)}
      className={cn(
        className,
        "transition-colors hover:bg-[color-mix(in_srgb,var(--color-pane),var(--color-on-surface)_5%)]",
      )}
    >
      {body}
    </Link>
  );
}

/** A team in the Teams view (prototype `.team-card`). */
export function TeamCard({ team }: { team: DirectoryTeam }) {
  const Icon = TEAM_AREA_ICON[team.area];
  return (
    <article className="flex flex-col gap-2.5 rounded-card bg-card p-4" aria-label={team.name}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="relative grid size-11 shrink-0 place-items-center text-on-primary-container"
        >
          <Shape kind="cookie6" className="absolute inset-0 size-full text-primary-container" />
          <Icon className="relative z-10 size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <b className="text-base font-medium">{team.name}</b>
          <span className="text-xs text-on-surface-variant">
            {formatCount(team.size, "person", "people")}
          </span>
        </div>
      </div>
      <p className="text-xs">{team.focus}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        {team.lead ? (
          <Link
            to={peoplePath(team.lead.id)}
            className="flex items-center gap-2 text-on-surface no-underline"
          >
            <PersonAvatar person={team.lead} size="sm" />
            <span className="text-xs">
              <b className="font-medium">{team.lead.name}</b>
              <br />
              <span className="text-on-surface-variant">Lead</span>
            </span>
          </Link>
        ) : (
          <span className="text-xs text-on-surface-variant">No one on this team yet</span>
        )}
        {team.members.length ? (
          <AvatarGroup
            aria-label={`${team.members.length} more members`}
            className="*:data-[slot=avatar]:ring-card"
          >
            {team.members.map((member) => (
              <PersonAvatar key={member.id} person={member} size="xs" />
            ))}
          </AvatarGroup>
        ) : null}
      </div>
    </article>
  );
}
