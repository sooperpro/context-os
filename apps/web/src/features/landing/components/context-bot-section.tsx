import { cn } from "cn";
import { useEffect, useState, type ReactNode } from "react";
import { BotGlyph } from "@/components/ui/bot-glyph";
import {
  AdminPanelSettingsIcon,
  BadgeIcon,
  BookmarkIcon,
  ChatIcon,
  DescriptionIcon,
  FactCheckIcon,
  HistoryIcon,
  PersonSearchIcon,
  SchoolIcon,
  SearchOffIcon,
  SendIcon,
  SupervisorAccountIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { Reveal, Section } from "@/features/landing/components/landing-parts";
import { prefersLessMotion } from "@/features/landing/motion";

/** How long each capability shows before the next, unless someone picks one. */
const TURN_MS = 6000;

interface Capability {
  icon: MaterialIcon;
  title: string;
  text: string;
  /** The mock conversation shown for it: illustrative, like a product screenshot. */
  scene: () => ReactNode;
}

const CAPABILITIES: Capability[] = [
  {
    icon: ChatIcon,
    title: "Answers, with the sources",
    text: "Ask in plain words. Every answer links to the documents it came from, so you can check it.",
    scene: AnswerScene,
  },
  {
    icon: SearchOffIcon,
    title: "Knows when it doesn't know",
    text: "No guessing. It says so, sends the question to the person who owns that area, and tells you when it's answered.",
    scene: GapScene,
  },
  {
    icon: HistoryIcon,
    title: "Explains the why",
    text: "Not just what's true now: the decision behind it, what changed, and when.",
    scene: WhyScene,
  },
  {
    icon: PersonSearchIcon,
    title: "Finds the right person",
    text: "Who owns a system, a process or a decision, and who has helped with it before.",
    scene: PeopleScene,
  },
  {
    icon: SchoolIcon,
    title: "Helps while you learn",
    text: "Stuck in a lesson? Ask it to explain more simply, then save the topic to revisit.",
    scene: LearnScene,
  },
];

/** What each role asks it most: useful for everyone, not just new hires. */
const ASKS: Array<{ icon: MaterialIcon; role: string; questions: string[] }> = [
  {
    icon: BadgeIcon,
    role: "Employees",
    questions: ["What should I finish this week?", "Who do I ask about expenses?"],
  },
  {
    icon: SupervisorAccountIcon,
    role: "Managers",
    questions: ["How is Leah's onboarding going?", "Which topics is my team stuck on?"],
  },
  {
    icon: FactCheckIcon,
    role: "People Ops",
    questions: ["Which new hires need a check-in?", "What went unanswered this month?"],
  },
  {
    icon: AdminPanelSettingsIcon,
    role: "Admins",
    questions: ["Which sources failed to sync?", "Who changed access policies this week?"],
  },
];

/**
 * Meet Context Bot (landing page): what it's most useful for, one capability at a time with its
 * own little scene, then what each role asks it. Capabilities advance on their own until someone
 * picks one; nothing moves for people who asked for less motion.
 */
export function ContextBotSection() {
  const lessMotion = useState(prefersLessMotion)[0];
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(!lessMotion);
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(
      () => setActive((index) => (index + 1) % CAPABILITIES.length),
      TURN_MS,
    );
    return () => clearTimeout(timer);
  }, [auto, active]);
  const current = CAPABILITIES[active]!;
  const Scene = current.scene;

  return (
    <Section
      id="context-bot"
      kicker="Meet Context Bot"
      title="The colleague who has read everything, and shows its sources"
    >
      <Reveal>
        <div className="grid items-start gap-8 min-[900px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ul className="flex flex-col gap-2" aria-label="What Context Bot does">
            {CAPABILITIES.map(({ icon: Icon, title, text }, index) => {
              const selected = index === active;
              return (
                <li key={title}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setActive(index);
                      setAuto(false);
                    }}
                    className={cn(
                      "group relative flex w-full items-start gap-3 overflow-hidden rounded-3xl p-4 text-start transition-colors duration-300",
                      selected
                        ? "bg-card shadow-sm ring-1 ring-outline-variant/40"
                        : "hover:bg-card/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-2xl transition-colors duration-300",
                        selected
                          ? "bg-ai-container text-on-ai-container"
                          : "bg-surface-container-high text-on-surface-variant",
                      )}
                    >
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">{title}</span>
                      <span
                        className={cn(
                          "grid text-sm text-on-surface-variant transition-[grid-template-rows,opacity] duration-500",
                          selected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <span className="overflow-hidden">{text}</span>
                      </span>
                    </span>
                    {selected && auto ? (
                      <span
                        key={active}
                        aria-hidden
                        className="landing-progress absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-linear-to-r from-primary to-ai"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="relative">
            <div
              aria-hidden
              className="landing-blob pointer-events-none absolute -inset-6 -z-10 rounded-[48px] bg-linear-to-br from-primary/15 via-ai/15 to-transparent blur-2xl"
            />
            <figure
              aria-label={`Example: ${current.title}`}
              className="relative min-h-96 overflow-hidden rounded-[32px] bg-card p-5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.35)] ring-1 ring-outline-variant/40 medium:p-6"
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span className="relative">
                  <BotGlyph size="sm" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-success ring-2 ring-card">
                    <span className="landing-ping absolute inset-0 rounded-full bg-success" />
                  </span>
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Context Bot</span>
                  <span className="text-xs text-on-surface-variant">{current.title}</span>
                </div>
              </div>
              <div key={active} className="landing-swap flex flex-col gap-3">
                <Scene />
              </div>
            </figure>
          </div>
        </div>
      </Reveal>

      <div className="flex flex-col gap-4">
        <Reveal>
          <h3 className="text-lg font-medium">Useful for everyone, not just new hires</h3>
        </Reveal>
        <div className="grid gap-3 medium:grid-cols-2 min-[900px]:grid-cols-4">
          {ASKS.map(({ icon: Icon, role, questions }, index) => (
            <Reveal key={role} delay={index * 0.1}>
              <div className="flex h-full flex-col gap-3 rounded-3xl bg-card p-5 ring-1 ring-outline-variant/30">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon aria-hidden className="size-5 text-primary" /> {role}
                </span>
                <ul className="flex flex-col gap-2">
                  {questions.map((question) => (
                    <li
                      key={question}
                      className="rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-sm text-on-surface"
                    >
                      “{question}”
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---- Scenes ----------------------------------------------------------------------------------- */

const at = (seconds: number) => ({ animationDelay: `${seconds}s` });

function Question({ children }: { children: ReactNode }) {
  return (
    <p className="landing-pop ms-auto max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
      {children}
    </p>
  );
}

function Reply({ children, delay = 0.5 }: { children: ReactNode; delay?: number }) {
  return (
    <div
      className="landing-pop max-w-[92%] rounded-3xl rounded-bl-md bg-surface-container-high px-4 py-3 text-sm"
      style={at(delay)}
    >
      {children}
    </div>
  );
}

function SourceChips({ sources, delay }: { sources: string[]; delay: number }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Sources">
      {sources.map((source, index) => (
        <li
          key={source}
          className="landing-pop inline-flex items-center gap-1.5 rounded-full bg-ai-container px-2.5 py-1 text-xs text-on-ai-container"
          style={at(delay + index * 0.15)}
        >
          <DescriptionIcon aria-hidden className="size-3.5" />
          <span className="font-medium">[S{index + 1}]</span> {source}
        </li>
      ))}
    </ul>
  );
}

function AnswerScene() {
  return (
    <>
      <Question>What's our refund window for annual plans?</Question>
      <Reply>
        30 days from the renewal date for a full refund. After that, refunds are pro-rated for the
        months left, and a team lead approves them.
      </Reply>
      <SourceChips sources={["Refund policy", "Billing FAQ"]} delay={0.9} />
      <span
        className="landing-pop self-start rounded-full bg-success-container px-2.5 py-1 text-xs text-on-success-container"
        style={at(1.3)}
      >
        High confidence · 2 sources agree
      </span>
    </>
  );
}

function GapScene() {
  return (
    <>
      <Question>Who approves laptop upgrades?</Question>
      <Reply>
        None of the sources you can open answer this yet, so I won't guess. I've sent it to the
        person who owns IT help.
      </Reply>
      <div className="flex items-center gap-3 px-1">
        <span
          className="landing-pop flex items-center gap-1.5 text-xs text-on-surface-variant"
          style={at(1)}
        >
          <SendIcon aria-hidden className="size-4 text-primary" /> Sent
        </span>
        <span
          aria-hidden
          className="landing-grow-x h-0.5 flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--color-primary)_0_6px,transparent_6px_12px)]"
          style={at(1.1)}
        />
        <span
          className="landing-slide-in flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs shadow-sm ring-1 ring-outline-variant/40"
          style={at(1.8)}
        >
          <span className="grid size-6 place-items-center rounded-full bg-secondary-container text-[10px] font-medium text-on-secondary-container">
            PS
          </span>
          Priya Shah · owns IT help
        </span>
      </div>
      <span
        className="landing-pop self-start rounded-full bg-info-container px-2.5 py-1 text-xs text-on-info-container"
        style={at(2.4)}
      >
        You'll be told when it has an answer
      </span>
    </>
  );
}

function WhyScene() {
  const events = [
    { when: "Mar 2025", what: "Decision: move billing to the ledger service (ADR-0007)" },
    { when: "Jun 2025", what: "Invoices and refunds migrated" },
    { when: "Now", what: "Old billing tables are read-only" },
  ];
  return (
    <>
      <Question>Why are we on the ledger service?</Question>
      <Reply>So refunds and invoices come from one auditable record. Here's how it happened:</Reply>
      <ol className="relative ms-3 flex flex-col gap-3 border-s-0 ps-6">
        <span
          aria-hidden
          className="landing-grow-y absolute top-1 bottom-1 left-0 w-0.5 rounded-full bg-linear-to-b from-primary to-ai"
          style={at(0.9)}
        />
        {events.map((event, index) => (
          <li
            key={event.when}
            className="landing-slide-in relative text-sm"
            style={at(1.1 + index * 0.35)}
          >
            <span
              aria-hidden
              className="absolute top-1.5 -left-[29px] size-2.5 rounded-full bg-primary ring-4 ring-card"
            />
            <span className="text-xs font-medium text-primary">{event.when}</span>
            <p>{event.what}</p>
          </li>
        ))}
      </ol>
      <SourceChips sources={["ADR-0007", "Billing architecture"]} delay={2.2} />
    </>
  );
}

function PeopleScene() {
  const people = [
    {
      initials: "SI",
      name: "Sana Iqbal",
      what: "Owns the ingest gateway",
      tone: "bg-primary-container text-on-primary-container",
    },
    {
      initials: "AM",
      name: "Arjun Mehta",
      what: "On-call and releases",
      tone: "bg-ai-container text-on-ai-container",
    },
  ];
  return (
    <>
      <Question>Who knows about carrier integrations?</Question>
      <Reply>Two people are your best bet:</Reply>
      <ul className="flex flex-col gap-2">
        {people.map((person, index) => (
          <li
            key={person.name}
            className="landing-slide-in flex items-center gap-3 rounded-2xl bg-surface-container-low p-3 ring-1 ring-outline-variant/30"
            style={at(1 + index * 0.3)}
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full text-sm font-medium",
                person.tone,
              )}
            >
              {person.initials}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{person.name}</span>
              <span className="text-xs text-on-surface-variant">{person.what}</span>
            </span>
            <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
              Ask
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LearnScene() {
  return (
    <>
      <div className="landing-pop flex items-center gap-2 self-start rounded-full bg-surface-container-high px-3 py-1.5 text-xs">
        <SchoolIcon aria-hidden className="size-4 text-primary" /> Lesson: Pricing and discounts
      </div>
      <Question>Explain the 20% rule like I'm new here</Question>
      <Reply>
        You can give up to 20% off on your own. Above that, the deal needs the Head of Sales, so add
        a note on the deal and tag them before you send the quote.
      </Reply>
      <span
        className="landing-pop inline-flex items-center gap-1.5 self-start rounded-full bg-secondary-container px-2.5 py-1 text-xs text-on-secondary-container"
        style={at(1.1)}
      >
        <BookmarkIcon aria-hidden className="size-3.5" /> Saved to revisit later
      </span>
    </>
  );
}
