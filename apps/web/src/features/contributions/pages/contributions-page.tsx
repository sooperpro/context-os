import type { KnowledgeGap } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { PageColumns, PageMain, PageSide } from "@/components/layout/page-columns";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  AddIcon,
  CallSplitIcon,
  EditNoteIcon,
  HelpIcon,
  HistoryIcon,
  SmartToyIcon,
} from "@/components/ui/icons";
import { MiniTile } from "@/components/ui/kpi-tile";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { CONTRIBUTION_ENDPOINTS as E } from "@/features/contributions/api/contributions.api";
import {
  myContributionsQuery,
  myKnowledgeGapsQuery,
} from "@/features/contributions/api/contributions.queries";
import { ContributionItem } from "@/features/contributions/components/contribution-item";
import { isInReview } from "@/features/contributions/contribution-meta";

const GAP_ICON: Record<KnowledgeGap["reason"], ReactNode> = {
  no_answer: <HelpIcon />,
  stale: <HistoryIcon />,
  conflict: <CallSplitIcon />,
};

const HOW_REVIEWS_WORK: Array<{ title: string; text: string }> = [
  {
    title: "Write it and add a source.",
    text: "Every page needs at least one source, so readers can check it.",
  },
  {
    title: "An owner reviews it.",
    text: "Pages about a system or project go to its owner. Glossary terms go to the team that uses them most.",
  },
  { title: "It’s published.", text: "Context Bot starts citing it right away." },
];

/** Contributions (prototype `contribPage`): gaps to fill, your contributions with their review state. */
export function ContributionsPage() {
  useBotContext(
    {
      chips: [{ icon: EditNoteIcon, label: "Your contributions" }],
      suggestions: ["How do I roll back a Kestrel deploy?", "Who should I ask about Kestrel?"],
      intro: "I can find sources for a draft and tell you who’s likely to review it.",
    },
    "contributions",
  );
  const contributions = useQuery(myContributionsQuery());
  const gaps = useQuery(myKnowledgeGapsQuery());
  const location = useLocation();
  const highlight = (location.state as { highlight?: string } | null)?.highlight;

  const items = contributions.data ?? [];
  const stats: Array<[string, number]> = [
    ["Contributions", items.length],
    [
      "Published",
      items.filter((item) => item.status === "published" || item.status === "resolved").length,
    ],
    ["In review", items.filter((item) => isInReview(item.status)).length],
    ["Drafts", items.filter((item) => item.status === "draft").length],
  ];

  return (
    <div className="mx-auto flex max-w-360 flex-col">
      <PageHeader
        kicker="Your contributions"
        title="Contributions"
        description="Help the next person. Fill gaps, fix what’s out of date, and track your reviews."
        actions={
          <Button nativeButton={false} render={<Link to="/contributions/new" />}>
            <AddIcon aria-hidden /> New contribution
          </Button>
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-3 medium:mb-4 @min-[640px]:grid-cols-4">
        {stats.map(([label, value]) => (
          <MiniTile
            key={label}
            label={label}
            value={contributions.data ? value : "–"}
            className="rounded-xl bg-card px-5 py-4"
          />
        ))}
      </div>
      <PageColumns>
        <PageMain>
          <SectionCard
            title="Knowledge gaps you could fill"
            count={gaps.data?.length}
            endpoint={E.gaps.path}
            status={gaps}
            action={
              <StatusChip tone="ai" icon={<SmartToyIcon />}>
                Found by Context Bot
              </StatusChip>
            }
          >
            {gaps.data?.length ? (
              <SegmentedList>
                {gaps.data.map((gap) => (
                  <SegmentedItem key={gap.id} className="flex-wrap @min-[640px]:flex-nowrap">
                    <SegmentedItemLead tone="ai">{GAP_ICON[gap.reason]}</SegmentedItemLead>
                    <SegmentedItemBody>
                      <SegmentedItemTitle className="whitespace-normal">
                        {gap.question}
                      </SegmentedItemTitle>
                      <span className="text-xs text-on-surface-variant">{gap.detail}</span>
                      {gap.related.length ? (
                        <SegmentedItemMeta>Related: {gap.related.join(", ")}</SegmentedItemMeta>
                      ) : null}
                    </SegmentedItemBody>
                    <SegmentedItemTrail className="ps-14 @min-[640px]:ps-0">
                      <Button
                        size="xs"
                        variant="secondary"
                        nativeButton={false}
                        render={
                          <Link to={`/contributions/new?gap=${encodeURIComponent(gap.id)}`} />
                        }
                      >
                        {gap.suggestedKind === "article" ? "Write it" : "Suggest a fix"}
                      </Button>
                    </SegmentedItemTrail>
                  </SegmentedItem>
                ))}
              </SegmentedList>
            ) : (
              <p className="text-sm text-on-surface-variant">No open gaps right now. Nice.</p>
            )}
          </SectionCard>
          <SectionCard
            title="Your contributions"
            count={contributions.data?.length}
            endpoint={E.mine.path}
            status={contributions}
          >
            {items.length ? (
              <ol className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <ContributionItem key={item.id} item={item} highlighted={item.id === highlight} />
                ))}
              </ol>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Nothing yet. Fill a gap above, or start a new contribution.
              </p>
            )}
          </SectionCard>
        </PageMain>
        <PageSide>
          <SectionCard title="How reviews work">
            <ol className="flex flex-col gap-3">
              {HOW_REVIEWS_WORK.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary-container text-xs font-medium text-on-secondary-container">
                    {index + 1}
                  </span>
                  <span>
                    <b className="font-medium">{step.title}</b> {step.text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-on-surface-variant">
              Reviews usually take about two working days.
            </p>
          </SectionCard>
        </PageSide>
      </PageColumns>
    </div>
  );
}
