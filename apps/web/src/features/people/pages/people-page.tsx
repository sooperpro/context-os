import { PeopleFilterSchema, type PeopleFilter } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAssistant } from "@/components/layout/assistant-context";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { SectionCard } from "@/components/section-card";
import { PersonAvatar } from "@/components/ui/avatar";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Chip } from "@/components/ui/chip";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  AccountTreeIcon,
  CheckIcon,
  GroupIcon,
  NorthEastIcon,
  PersonIcon,
  PersonSearchIcon,
} from "@/components/ui/icons";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { EmptyMini } from "@/components/ui/empty-mini";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { PEOPLE_ENDPOINTS as E } from "@/features/people/api/people.api";
import {
  directoryQuery,
  expertsQuery,
  teamsDirectoryQuery,
} from "@/features/people/api/people.queries";
import { OrgNode, PersonCard, TeamCard } from "@/features/people/components/person-parts";
import { TEAM_AREA_ICON, peoplePath } from "@/features/people/people-meta";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCount } from "@/lib/format";

const FILTERS: Array<[PeopleFilter, string]> = [
  ["all", "Everyone"],
  ["team", "My team"],
  ["experts", "Experts"],
  ["new", "New joiners"],
];

const ASK_PROMPTS = [
  "Who are the experts on billing?",
  "Who is on my team?",
  "Who owns the ingest gateway?",
];

/** People (prototype `directoryPage`): find who owns what and who knows what. */
export function PeoplePage() {
  useBotContext(
    {
      chips: [{ icon: GroupIcon, label: "People directory" }],
      suggestions: [
        "Who are the experts on billing?",
        "Who is on the Platform team?",
        "Who owns the ingest gateway?",
      ],
      intro: "I can find the right person for a question and show what they own.",
    },
    "people",
  );
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "teams" ? "teams" : "people";
  const directory = useQuery(directoryQuery("", "all"));
  const { openAssistant } = useAssistant();

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker={
          directory.data
            ? `${formatCount(directory.data.total, "person", "people")} · ${formatCount(directory.data.teamCount, "team")}`
            : undefined
        }
        title="People"
        description="Find who owns what and who knows what. Expertise comes from what people own and contribute in the Knowledge Hub."
        actions={
          <ConnectedButtonGroup aria-label="View">
            <ConnectedButton
              pressed={view === "people"}
              onClick={() => setParams({}, { replace: true })}
            >
              <PersonIcon aria-hidden /> People
            </ConnectedButton>
            <ConnectedButton
              pressed={view === "teams"}
              onClick={() => setParams({ view: "teams" }, { replace: true })}
            >
              <AccountTreeIcon aria-hidden /> Teams
            </ConnectedButton>
          </ConnectedButtonGroup>
        }
      />
      <PageColumns>
        <PageMain>{view === "teams" ? <TeamsView /> : <DirectoryView />}</PageMain>
        <PageSide>
          <ExpertsCard />
          <SectionCard
            tone="ai"
            title={
              <span className="flex items-center gap-2.5">
                <BotGlyph size="sm" />
                Not sure who to ask?
              </span>
            }
          >
            <p className="text-sm text-on-surface-variant">
              Describe the problem and Context Bot will suggest the right person and the pages they
              own.
            </p>
            <div className="flex flex-col items-start gap-2">
              {ASK_PROMPTS.map((prompt) => (
                <Chip key={prompt} variant="prompt" onClick={() => openAssistant(prompt)}>
                  <NorthEastIcon aria-hidden className="text-ai" />
                  {prompt}
                </Chip>
              ))}
            </div>
          </SectionCard>
        </PageSide>
      </PageColumns>
    </div>
  );
}

function DirectoryView() {
  const [params, setParams] = useSearchParams();
  const filter = PeopleFilterSchema.catch("all").parse(params.get("filter") ?? "all");
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(text.trim(), 250);
  const query = useQuery(directoryQuery(q, filter));
  const items = query.data?.items ?? [];

  // Keep the search in the URL so a filtered directory can be shared and survives a reload.
  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (q) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const setFilter = (value: PeopleFilter) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === "all") next.delete("filter");
        else next.set("filter", value);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <div className="flex flex-col gap-3">
        <SearchField
          label="Search people"
          value={text}
          onValueChange={setText}
          placeholder="Search by name, role, team or skill"
          className="max-w-160"
        />
        <div role="group" aria-label="Filter people" className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([value, label]) => (
            <Chip
              key={value}
              variant="filter"
              selected={filter === value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {filter === value ? <CheckIcon aria-hidden /> : null}
              {label}
            </Chip>
          ))}
          <PreviewDataChip endpoint={E.directory.path} />
        </div>
      </div>
      <p className="text-xs text-on-surface-variant" aria-live="polite">
        {query.data
          ? `${formatCount(items.length, "person", "people")}${q ? ` matching “${q}”` : ""}`
          : "Loading people…"}
      </p>
      {query.isPending ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
          aria-busy="true"
        >
          {[0, 1, 2, 3].map((tile) => (
            <Skeleton key={tile} className="h-52 rounded-card" />
          ))}
        </div>
      ) : items.length ? (
        <ul
          aria-label="People"
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
        >
          {items.map((person) => (
            <li key={person.id} className="flex">
              <PersonCard person={person} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyMini
          className="rounded-xl bg-card p-5"
          icon={<PersonSearchIcon />}
          title={q ? `No one matches “${q}”` : "No one here yet"}
          description="Try a skill or system name, or ask Context Bot who knows."
        />
      )}
    </>
  );
}

function TeamsView() {
  const query = useQuery(teamsDirectoryQuery());
  const data = query.data;
  return (
    <>
      {data?.myTeam ? (
        <SectionCard
          title={`${data.myTeam.name} team`}
          endpoint={E.teams.path}
          action={<span className="text-xs text-on-surface-variant">Your team</span>}
        >
          <div className="flex flex-col items-start">
            <OrgNode person={data.myTeam.lead} size="md" emphasis badges={data.myTeam.lead} />
            <span aria-hidden className="ms-7.5 h-4 w-0.5 bg-outline-variant" />
            <ul className="grid w-full grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2 rounded-tl-[2px] border-t-2 border-outline-variant pt-3">
              {data.myTeam.members.map((member) => (
                <li key={member.id}>
                  <OrgNode person={member} badges={member} />
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>
      ) : null}
      {query.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : query.isError ? (
        <SectionCard title="Teams" endpoint={E.teams.path} status={query} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {data?.items.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </>
  );
}

function ExpertsCard() {
  const query = useQuery(expertsQuery());
  return (
    <SectionCard title="Ask an expert" endpoint={E.experts.path} status={query}>
      <SegmentedList>
        {(query.data?.items ?? []).map((expert) => {
          const Icon = TEAM_AREA_ICON[expert.area];
          return (
            <SegmentedItem
              key={expert.topic}
              render={<Link to={peoplePath(expert.person.id)} />}
              className="min-h-0 gap-3 px-3 py-2.5"
            >
              <SegmentedItemLead tone="neutral" size="sm">
                <Icon aria-hidden />
              </SegmentedItemLead>
              <SegmentedItemBody>
                <SegmentedItemTitle>{expert.topic}</SegmentedItemTitle>
                <SegmentedItemMeta>{expert.person.name}</SegmentedItemMeta>
              </SegmentedItemBody>
              <PersonAvatar person={expert.person} size="sm" />
            </SegmentedItem>
          );
        })}
      </SegmentedList>
    </SectionCard>
  );
}
