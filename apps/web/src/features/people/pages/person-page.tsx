import type { KnowledgeSection, PersonProfile } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { ProfileHero } from "@/components/profile-hero";
import { SectionCard } from "@/components/section-card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  AccountTreeIcon,
  ApartmentIcon,
  CalendarMonthIcon,
  ChatIcon,
  ConversionPathIcon,
  EditIcon,
  EventIcon,
  ForumIcon,
  GavelIcon,
  GroupsIcon,
  LocalShippingIcon,
  LocationOnIcon,
  MenuBookIcon,
  PersonIcon,
  RocketLaunchIcon,
  ScheduleIcon,
  SmartToyIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip, TypeChip } from "@/components/ui/meta-chip";
import { PEOPLE_ENDPOINTS as E } from "@/features/people/api/people.api";
import { personQuery } from "@/features/people/api/people.queries";
import { OrgNode, PersonBadges } from "@/features/people/components/person-parts";
import { roleAndTeam } from "@/features/people/people-meta";
import { meQuery } from "@/features/account/api/account.queries";
import { personOnboardingQuery } from "@/features/people-ops/api/people-ops.queries";
import { PersonDetailsDialog } from "@/features/people-ops/components/person-details-dialog";
import { onboardingPath } from "@/features/people-ops/people-ops-meta";
import { memberPath } from "@/features/team/team-meta";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { comingSoon } from "@/lib/coming-soon";
import { firstName, formatJoined, formatTimeZone } from "@/lib/format";
import { SECTION_LABEL } from "@/lib/labels";

const SECTION_ICON: Record<KnowledgeSection, MaterialIcon> = {
  company: ApartmentIcon,
  product: LocalShippingIcon,
  project: RocketLaunchIcon,
  system: AccountTreeIcon,
  process: ConversionPathIcon,
  decision: GavelIcon,
  glossary: MenuBookIcon,
};

/** A person's profile (prototype `profilePage`): who they are, what they own, where they sit. */
export function PersonPage() {
  const { personId = "" } = useParams();
  const query = useQuery(personQuery(personId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the profile" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-360">
        <SectionCard
          title="This profile could not be loaded"
          endpoint={E.profile.path}
          status={query}
        />
      </div>
    );
  }
  return <Profile person={query.data} />;
}

function Profile({ person }: { person: PersonProfile }) {
  const { openAssistant } = useAssistant();
  const first = firstName(person.name);
  // HR sees the onboarding card for everyone onboarding, with a link to their record (spec §4.5).
  // Owners see everything, so they get HR's view too.
  const { persona, seesEverything } = useViewer();
  const peopleOps = persona === "people_ops" || seesEverything;
  // People Ops can change a person's job title, team and manager, but not their own.
  const me = useQuery({ ...meQuery(), enabled: peopleOps });
  const canEdit = peopleOps && me.data !== undefined && me.data.id !== person.id;
  const [editing, setEditing] = useState(false);
  const record = useQuery({
    ...personOnboardingQuery(person.id),
    enabled: peopleOps,
  }).data;
  const onboarding = record
    ? { startedOn: record.startDate, status: record.status }
    : person.onboarding;
  useBotContext(
    {
      chips: [
        { icon: PersonIcon, label: person.name },
        ...(person.team ? [{ icon: GroupsIcon, label: person.team.name }] : []),
      ],
      suggestions: [`What does ${first} work on?`, "Who are the experts on billing?"],
      intro: `Ask about ${first}’s work and the pages they own.`,
    },
    `person:${person.id}`,
  );
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/people" />}>People</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{person.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProfileHero
        person={person}
        chips={
          <>
            <PersonBadges person={person} />
            <PreviewDataChip endpoint={E.profile.path} />
          </>
        }
        subtitle={roleAndTeam(person)}
        actions={
          <>
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <EditIcon aria-hidden /> Edit details
              </Button>
            ) : null}
            {seesEverything ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to={`/conversations?person=${encodeURIComponent(person.id)}`} />}
              >
                <ForumIcon aria-hidden /> Read conversations
              </Button>
            ) : null}
            <Button onClick={() => comingSoon("Messages")}>
              <ChatIcon aria-hidden /> Message
            </Button>
            <Button variant="outline" onClick={() => comingSoon("Booking time")}>
              <EventIcon aria-hidden /> Book time
            </Button>
            <Button variant="ai-tonal" onClick={() => openAssistant(`What does ${first} work on?`)}>
              <SmartToyIcon aria-hidden /> What does {first} work on?
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {person.location ? (
            <MetaChip tone="filled">
              <LocationOnIcon aria-hidden /> {person.location}
            </MetaChip>
          ) : null}
          {person.timeZone ? (
            <MetaChip tone="filled">
              <ScheduleIcon aria-hidden /> {formatTimeZone(person.timeZone)}
            </MetaChip>
          ) : null}
          {person.joinedOn ? (
            <MetaChip tone="filled">
              <CalendarMonthIcon aria-hidden /> {formatJoined(person.joinedOn)}
            </MetaChip>
          ) : null}
        </div>
      </ProfileHero>
      <PageColumns>
        <PageMain>
          <SectionCard title="About">
            {person.bio ? <p className="text-base whitespace-pre-line">{person.bio}</p> : null}
            {!person.bio && !person.skills.length ? (
              <p className="text-sm text-on-surface-variant">
                {person.relations.includes("you") ? (
                  <>
                    Add a bio and skills in <Link to="/settings">Settings</Link> so people know what
                    to ask you about.
                  </>
                ) : (
                  `${first} hasn’t added a bio or skills yet.`
                )}
              </p>
            ) : null}
            {person.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {person.skills.map((skill) => (
                  <MetaChip key={skill} tone="outline" className="h-7.5 px-3 text-sm">
                    {skill}
                  </MetaChip>
                ))}
              </div>
            ) : null}
          </SectionCard>
          {person.owns.length ? (
            <SectionCard title="Owns in the Knowledge Hub" count={person.owns.length}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {person.owns.map((item) => {
                  const Icon = SECTION_ICON[item.section];
                  return (
                    <Link
                      key={item.id}
                      to={
                        item.projectId
                          ? `/projects/${item.projectId}`
                          : `/knowledge?cat=${item.section}`
                      }
                      className="flex flex-col items-start gap-2 rounded-lg bg-pane p-3.5 text-on-surface no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-pane),var(--color-on-surface)_5%)]"
                    >
                      <TypeChip>
                        <Icon aria-hidden /> {SECTION_LABEL[item.section]}
                      </TypeChip>
                      <span className="text-sm font-medium">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}
          {onboarding ? (
            <SectionCard
              title="Onboarding"
              className="bg-[color-mix(in_srgb,var(--color-primary-container)_45%,var(--color-card))]"
              action={<OnboardingStatusChip status={onboarding.status} />}
            >
              <p className="text-sm">
                In onboarding since {formatJoined(onboarding.startedOn).replace(/^Joined /, "")}.
                Progress, check-ins and readiness are on the onboarding page.
              </p>
              {record ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  nativeButton={false}
                  render={<Link to={onboardingPath(record.id)} />}
                >
                  Open onboarding record
                </Button>
              ) : (
                // Only their manager gets `onboarding` from the API: open the team member page.
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  nativeButton={false}
                  render={<Link to={memberPath(person.id)} />}
                >
                  Open onboarding
                </Button>
              )}
            </SectionCard>
          ) : null}
        </PageMain>
        <PageSide>
          <SectionCard title="Reporting line">
            <div className="flex flex-col">
              {person.manager ? (
                <>
                  <OrgNode person={person.manager} />
                  <span aria-hidden className="ms-5.5 h-3.5 w-0.5 bg-outline-variant" />
                </>
              ) : null}
              <OrgNode
                person={{ id: person.id, name: person.name, title: person.title }}
                emphasis
              />
              {person.reports.length ? (
                <>
                  <span aria-hidden className="ms-5.5 h-3.5 w-0.5 bg-outline-variant" />
                  <ul className="flex flex-col gap-0.5" aria-label={`Reports to ${first}`}>
                    {person.reports.map((report) => (
                      <li key={report.id}>
                        <OrgNode person={report} size="xs" />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </SectionCard>
        </PageSide>
      </PageColumns>
      {canEdit ? (
        <PersonDetailsDialog personId={person.id} open={editing} onOpenChange={setEditing} />
      ) : null}
    </div>
  );
}
