import type { KnowledgeSection, PersonProfile } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { OnboardingStatusChip } from "@/components/onboarding-status-chip";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
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
  EventIcon,
  GavelIcon,
  HubIcon,
  LocalShippingIcon,
  LocationOnIcon,
  MenuBookIcon,
  RocketLaunchIcon,
  ScheduleIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { MetaChip, TypeChip } from "@/components/ui/meta-chip";
import { PEOPLE_ENDPOINTS as E } from "@/features/people/api/people.api";
import { personQuery } from "@/features/people/api/people.queries";
import { OrgNode, PersonBadges } from "@/features/people/components/person-parts";
import { roleAndTeam } from "@/features/people/people-meta";
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
        <SectionCard title="This profile could not be loaded" endpoint={E.profile.path} status={query} />
      </div>
    );
  }
  return <Profile person={query.data} />;
}

function Profile({ person }: { person: PersonProfile }) {
  const { openAssistant } = useAssistant();
  const first = firstName(person.name);
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
      <header className="flex flex-col items-start gap-4 px-1 pt-2 @min-[640px]:flex-row @min-[640px]:gap-7">
        <PersonAvatar person={person} size="xl" className="size-22 text-3xl @min-[640px]:size-30 @min-[640px]:text-[40px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <PersonBadges person={person} />
            <PreviewDataChip endpoint={E.profile.path} />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight medium:text-[32px] medium:leading-10">
            {person.name}
          </h1>
          <p className="text-base">{roleAndTeam(person)}</p>
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
          <div className="mt-1 flex flex-wrap gap-3">
            <Button onClick={() => comingSoon("Messages")}>
              <ChatIcon aria-hidden /> Message
            </Button>
            <Button variant="outline" onClick={() => comingSoon("Booking time")}>
              <EventIcon aria-hidden /> Book time
            </Button>
            <Button variant="ai-tonal" onClick={() => openAssistant(`What does ${first} work on?`)}>
              <HubIcon aria-hidden /> What does {first} work on?
            </Button>
          </div>
        </div>
      </header>
      <PageColumns>
        <PageMain>
          <SectionCard title="About">
            {person.bio ? <p className="text-base">{person.bio}</p> : null}
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
                      to={item.projectId ? `/projects/${item.projectId}` : `/knowledge?cat=${item.section}`}
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
          {person.onboarding ? (
            <SectionCard
              title="Onboarding"
              className="bg-[color-mix(in_srgb,var(--color-primary-container)_45%,var(--color-card))]"
              action={<OnboardingStatusChip status={person.onboarding.status} />}
            >
              <p className="text-sm">
                In onboarding since {formatJoined(person.onboarding.startedOn).replace(/^Joined /, "")}. Progress,
                check-ins and readiness are on the onboarding page.
              </p>
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
              <OrgNode person={{ id: person.id, name: person.name, title: person.title }} emphasis />
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
    </div>
  );
}
