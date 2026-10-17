import { cn } from "cn";
import { useEffect, useState } from "react";
import { Brand } from "@/components/layout/brand";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Button } from "@/components/ui/button";
import {
  AdminPanelSettingsIcon,
  ArrowForwardIcon,
  BadgeIcon,
  CheckCircleIcon,
  CheckIcon,
  DescriptionIcon,
  FactCheckIcon,
  HubIcon,
  LockIcon,
  RouteIcon,
  SmartToyIcon,
  SupervisorAccountIcon,
  SyncIcon,
  VerifiedUserIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { Shape, type ShapeKind } from "@/components/ui/shape";
import { BrandArt } from "@/features/auth/components/sign-in-layout";
import { ContextBotSection } from "@/features/landing/components/context-bot-section";
import { Reveal, Section } from "@/features/landing/components/landing-parts";
import { prefersLessMotion } from "@/features/landing/motion";
import "./landing.css";

/** Where the sign-in screen opens in each mode (the auth gate reads `mode`). */
export const LOG_IN_PATH = "/?mode=sign-in";
export const SIGN_UP_PATH = "/?mode=sign-up";

/* ---- Content -------------------------------------------------------------------------------- */

/** What the hero's Context Bot answers, in turn. Illustrative, like a product screenshot. */
const DEMOS = [
  {
    question: "Who approves discounts over 20%?",
    answer:
      "The Head of Sales signs off anything above 20%. Up to 20%, account executives decide, and note it on the deal.",
    sources: ["Sales playbook", "Pricing policy 2026"],
  },
  {
    question: "Why did we move billing to the ledger service?",
    answer:
      "So refunds and invoices come from one auditable record. It was decided in ADR-0007, and the old billing tables are read-only since March.",
    sources: ["ADR-0007", "Billing architecture"],
  },
  {
    question: "How do I get access to the analytics dashboard?",
    answer:
      "Ask in IT help with your manager copied. Access is granted within a working day, and only shows the projects you can already open.",
    sources: ["IT help: access requests"],
  },
] as const;

const QUESTIONS = [
  "Who owns the pricing page?",
  "What's our refund policy?",
  "Where is the brand kit?",
  "How do I book a customer demo?",
  "What changed in the last release?",
  "Who approves travel over £500?",
  "How does on-call work here?",
  "Which CRM fields are required?",
  "What's in my first 30 days?",
  "Who do I ask about payroll?",
];

const STEPS: Array<{ icon: MaterialIcon; shape: ShapeKind; title: string; text: string }> = [
  {
    icon: SyncIcon,
    shape: "cookie9",
    title: "Connect Google Drive",
    text: "Read-only. Folders sort themselves into the Knowledge Hub; no projects to set up first.",
  },
  {
    icon: HubIcon,
    shape: "clover8",
    title: "Knowledge, organised",
    text: "Company facts, products, processes and decisions, each with the passage that proves it.",
  },
  {
    icon: RouteIcon,
    shape: "flower",
    title: "Onboarding for every role",
    text: "AI drafts roadmaps and modules from what the company knows. People Ops publish them.",
  },
  {
    icon: SmartToyIcon,
    shape: "sunny",
    title: "Answers with sources",
    text: "Context Bot answers from what each person can already open, and says so when it can't.",
  },
];

const ROLES: Array<{
  icon: MaterialIcon;
  role: string;
  pitch: string;
  gets: string[];
  tone: string;
}> = [
  {
    icon: BadgeIcon,
    role: "Employees",
    pitch: "Productive in weeks, not months.",
    gets: [
      "A 90-day roadmap built from your company's own documents",
      "Answers with the sources they came from",
      "Who owns what, and who to ask",
    ],
    tone: "bg-primary-container text-on-primary-container",
  },
  {
    icon: SupervisorAccountIcon,
    role: "Managers",
    pitch: "See who needs you, before they ask.",
    gets: [
      "Each new hire's progress, check-ins and knowledge checks",
      "Nudges when someone is stuck or a gap shows up",
      "Probation recommendations in a few clicks",
    ],
    tone: "bg-secondary-container text-on-secondary-container",
  },
  {
    icon: FactCheckIcon,
    role: "People Ops",
    pitch: "Every onboarding, in one place.",
    gets: [
      "Templates for every role, drafted by AI and reviewed by you",
      "Onboardings, probation reviews and teams together",
      "Knowledge gaps from the questions nobody could answer",
    ],
    tone: "bg-ai-container text-on-ai-container",
  },
  {
    icon: AdminPanelSettingsIcon,
    role: "Admins",
    pitch: "Set up in an afternoon.",
    gets: [
      "Google Drive connected read-only, sharing respected",
      "Roles, single sign-on and an audit log",
      "A guided setup from company profile to first new hire",
    ],
    tone: "bg-surface-container-highest text-on-surface",
  },
];

/* ---- Page ------------------------------------------------------------------------------------ */

/**
 * The public front door (N-5): what ContextOS does, what each role gets, and the way in, with a
 * live Context Bot demo and gentle motion. Shown at the root to anyone signed out; "Log in" and
 * "Sign up your company" open the sign-in screen.
 */
export function LandingPage() {
  return (
    <div className="landing-root relative min-h-svh overflow-x-clip bg-shell text-on-surface">
      <Header />
      <main>
        <Hero />
        <QuestionRibbon />
        <ContextBotSection />
        <HowItWorks />
        <Roles />
        <Trust />
        <FinalCall />
      </main>
      <footer className="mx-auto flex max-w-300 flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-on-surface-variant medium:px-6">
        <Brand />
        <span className="text-xs">Company knowledge and onboarding, with sources.</span>
        <nav aria-label="Footer" className="ms-auto flex gap-4">
          <a href={LOG_IN_PATH} className="hover:text-on-surface">
            Log in
          </a>
          <a href={SIGN_UP_PATH} className="hover:text-on-surface">
            Sign up your company
          </a>
        </nav>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant/40 bg-shell/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-300 items-center gap-6 px-4 medium:px-6">
        <Brand />
        <nav
          aria-label="Sections"
          className="hidden items-center gap-5 text-sm text-on-surface-variant min-[900px]:flex"
        >
          <a href="#how" className="hover:text-on-surface">
            How it works
          </a>
          <a href="#roles" className="hover:text-on-surface">
            For every role
          </a>
          <a href="#trust" className="hover:text-on-surface">
            Security
          </a>
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<a href={LOG_IN_PATH} />}>
            Log in
          </Button>
          <Button nativeButton={false} render={<a href={SIGN_UP_PATH} />}>
            <span className="hidden medium:inline">Sign up your company</span>
            <span className="medium:hidden">Sign up</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section aria-labelledby="landing-title" className="relative isolate">
      {/* Drifting color behind the hero. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="landing-blob absolute -top-32 -left-24 size-[34rem] rounded-full bg-primary/25 blur-3xl" />
        <div className="landing-blob-slow absolute top-20 -right-32 size-[30rem] rounded-full bg-ai/20 blur-3xl" />
        <div className="landing-blob absolute -bottom-40 left-1/3 size-[26rem] rounded-full bg-secondary/20 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-300 items-center gap-12 px-4 pt-12 pb-16 medium:px-6 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[900px]:pt-20 min-[900px]:pb-24">
        <div className="flex flex-col items-start gap-6">
          <span className="landing-pop inline-flex items-center gap-2 rounded-full bg-ai-container px-3 py-1.5 text-xs font-medium text-on-ai-container">
            <SmartToyIcon aria-hidden className="size-4" /> AI onboarding and company knowledge
          </span>
          <h1
            id="landing-title"
            className="font-heading text-[40px] leading-[46px] font-[560] tracking-[-0.5px] text-balance [font-variation-settings:'ROND'_60] medium:text-[56px] medium:leading-[62px]"
          >
            Everything your people need to know,{" "}
            <span className="bg-linear-to-r from-primary to-ai bg-clip-text text-transparent">
              in one place.
            </span>
          </h1>
          <p className="max-w-135 text-lg text-on-surface-variant">
            ContextOS turns your company's documents into a Knowledge Hub, an onboarding roadmap for
            every role, and answers with sources. New hires get up to speed, and nobody asks the
            same question twice.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="md" nativeButton={false} render={<a href={SIGN_UP_PATH} />}>
              Sign up your company <ArrowForwardIcon aria-hidden />
            </Button>
            <Button
              size="md"
              variant="outline"
              nativeButton={false}
              render={<a href={LOG_IN_PATH} />}
            >
              Log in
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-surface-variant">
            {["Read-only Google Drive", "Permissions mirrored", "Every answer cited"].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircleIcon aria-hidden className="size-4.5 text-primary" /> {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <HeroDemo />
      </div>
    </section>
  );
}

/** A Context Bot conversation that plays itself, beside a roadmap that fills in. */
function HeroDemo() {
  return (
    <div className="relative mx-auto w-full max-w-130">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-6 w-28 text-primary/80"
      >
        <Shape kind="cookie9" className="landing-spin w-full" />
      </div>
      <div aria-hidden className="pointer-events-none absolute -bottom-6 -left-6 w-14 text-ai/40">
        <Shape kind="clover4" className="landing-spin w-full [animation-direction:reverse]" />
      </div>
      <figure
        aria-label="Context Bot answering a question, with its sources"
        className="landing-float relative rounded-[28px] bg-card p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.35)] ring-1 ring-outline-variant/40"
      >
        <ChatDemo />
      </figure>
      <RoadmapCard />
      <div className="landing-float-late absolute -top-5 left-6 hidden items-center gap-2 rounded-full bg-success-container px-3 py-1.5 text-xs font-medium text-on-success-container shadow-lg medium:flex">
        <CheckIcon aria-hidden className="size-4" /> Knowledge gap answered
      </div>
    </div>
  );
}

function ChatDemo() {
  const lessMotion = useState(prefersLessMotion)[0];
  // It opens on a finished answer, so the card is never empty; then the next question types itself.
  const [turn, setTurn] = useState(0);
  const [typed, setTyped] = useState<number>(DEMOS[0].question.length);
  const [phase, setPhase] = useState<"typing" | "thinking" | "answer">("answer");
  const demo = DEMOS[turn % DEMOS.length]!;

  useEffect(() => {
    if (lessMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      timer =
        typed < demo.question.length
          ? setTimeout(() => setTyped((count) => count + 1), 38)
          : setTimeout(() => setPhase("thinking"), 350);
    } else if (phase === "thinking") {
      timer = setTimeout(() => setPhase("answer"), 1300);
    } else {
      timer = setTimeout(() => {
        setTurn((current) => current + 1);
        setTyped(0);
        setPhase("typing");
      }, 5200);
    }
    return () => clearTimeout(timer);
  }, [lessMotion, phase, typed, demo.question.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <BotGlyph size="sm" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Context Bot</span>
          <span className="text-xs text-on-surface-variant">
            Answers from your company's knowledge
          </span>
        </div>
      </div>
      <p className="ms-auto max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {demo.question.slice(0, typed)}
        {phase === "typing" ? <span className="landing-caret ms-0.5">|</span> : null}
      </p>
      <div className="min-h-30">
        {phase === "answer" ? null : (
          <div className="flex flex-col gap-2.5" aria-hidden>
            <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              {phase === "thinking"
                ? `Reading ${demo.sources.length === 1 ? "1 source" : `${demo.sources.length} sources`}`
                : "Listening"}
              <span className="landing-dot">•</span>
              <span className="landing-dot [animation-delay:0.2s]">•</span>
              <span className="landing-dot [animation-delay:0.4s]">•</span>
            </p>
            <span className="h-3 w-[92%] animate-pulse rounded-full bg-surface-container-high" />
            <span className="h-3 w-[78%] animate-pulse rounded-full bg-surface-container-high" />
            <span className="h-3 w-[55%] animate-pulse rounded-full bg-surface-container-high" />
          </div>
        )}
        {phase === "answer" ? (
          <div key={turn} className="flex flex-col gap-3">
            <p className="landing-pop rounded-3xl rounded-bl-md bg-surface-container-high px-4 py-3 text-sm">
              {demo.answer}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Sources">
              {demo.sources.map((source, index) => (
                <li
                  key={source}
                  className="landing-pop inline-flex items-center gap-1.5 rounded-full bg-ai-container px-2.5 py-1 text-xs text-on-ai-container"
                  style={{ animationDelay: `${0.25 + index * 0.15}s` }}
                >
                  <DescriptionIcon aria-hidden className="size-3.5" />
                  <span className="font-medium">[S{index + 1}]</span> {source}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RoadmapCard() {
  const modules = [
    { title: "How the company makes money", state: "Done" },
    { title: "Pricing and discounts", state: "In progress" },
    { title: "Your first customer demo", state: "Next" },
  ];
  return (
    <div className="landing-float-late relative ms-auto -mt-6 w-[78%] rounded-3xl bg-card p-4 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.4)] ring-1 ring-outline-variant/40 medium:-me-6 medium:-mt-10">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <RouteIcon aria-hidden className="size-4.5 text-primary" /> Your first 90 days
        </span>
        <span className="text-xs text-on-surface-variant">Sales executive</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-highest">
        <div className="landing-fill h-full w-[62%] rounded-full bg-linear-to-r from-primary to-ai" />
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {modules.map((module) => (
          <li key={module.title} className="flex items-center gap-2 text-xs">
            {module.state === "Done" ? (
              <CheckCircleIcon aria-hidden className="size-4 text-success" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "grid size-4 place-items-center rounded-full border-2",
                  module.state === "In progress" ? "border-primary" : "border-outline-variant",
                )}
              />
            )}
            <span className="flex-1">{module.title}</span>
            <span className="text-on-surface-variant">{module.state}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The kind of questions people ask, drifting past. */
function QuestionRibbon() {
  const lessMotion = useState(prefersLessMotion)[0];
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 gap-3 pe-3">
      {QUESTIONS.map((question) => (
        <li
          key={question}
          className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm whitespace-nowrap ring-1 ring-outline-variant/40"
        >
          <SmartToyIcon aria-hidden className="size-4 text-ai" /> {question}
        </li>
      ))}
    </ul>
  );
  return (
    <section
      aria-label="Questions people ask ContextOS"
      className="landing-marquee-track relative border-y border-outline-variant/40 bg-pane/60 py-4"
    >
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className={cn("flex w-max", lessMotion ? "flex-wrap" : "landing-marquee")}>
          {row(false)}
          {lessMotion ? null : row(true)}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section
      id="how"
      kicker="How it works"
      title="From scattered documents to answers, in four steps"
    >
      <Reveal className="relative">
        <div
          aria-hidden
          className="landing-line absolute top-10 right-[12%] left-[12%] hidden h-0.5 bg-linear-to-r from-primary via-ai to-secondary min-[900px]:block"
        />
        <ol className="relative grid gap-8 medium:grid-cols-2 min-[900px]:grid-cols-4">
          {STEPS.map(({ icon: Icon, shape, title, text }, index) => (
            <li key={title} className="flex flex-col items-center gap-3 text-center">
              <span className="relative grid size-20 place-items-center">
                <Shape
                  kind={shape}
                  className="landing-spin absolute inset-0 size-full text-primary-container"
                  style={{ animationDuration: `${30 + index * 8}s` }}
                />
                <Icon aria-hidden className="relative size-8 text-on-primary-container" />
              </span>
              <span className="text-xs font-medium tracking-wide text-primary uppercase">
                Step {index + 1}
              </span>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="max-w-64 text-sm text-on-surface-variant">{text}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  );
}

function Roles() {
  return (
    <Section id="roles" kicker="For every role" title="One place, and the right view for everyone">
      <div className="grid gap-4 medium:grid-cols-2">
        {ROLES.map(({ icon: Icon, role, pitch, gets, tone }, index) => (
          <Reveal key={role} delay={index * 0.08}>
            <article
              aria-labelledby={`role-${role}`}
              className="group flex h-full flex-col gap-4 rounded-[28px] bg-card p-6 ring-1 ring-outline-variant/30 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)]"
            >
              <div className="flex items-center gap-3">
                <span className={cn("grid size-12 place-items-center rounded-2xl", tone)}>
                  <Icon
                    aria-hidden
                    className="size-6 transition-transform duration-300 group-hover:scale-110"
                  />
                </span>
                <div className="flex flex-col">
                  <h3 id={`role-${role}`} className="text-lg font-medium">
                    {role}
                  </h3>
                  <span className="text-sm text-on-surface-variant">{pitch}</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {gets.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Trust() {
  const items: Array<{ icon: MaterialIcon; title: string; text: string }> = [
    {
      icon: LockIcon,
      title: "Read-only, always",
      text: "ContextOS never edits, deletes or shares anything in your Drive.",
    },
    {
      icon: VerifiedUserIcon,
      title: "Permissions mirrored",
      text: "People only get answers from documents they can already open.",
    },
    {
      icon: FactCheckIcon,
      title: "Cited and reviewed",
      text: "Every answer and lesson points to its sources, and People Ops publish what new hires get.",
    },
  ];
  return (
    <Section id="trust" kicker="Security" title="Built to respect what people can see">
      <Reveal>
        <div className="grid gap-px overflow-hidden rounded-[28px] bg-outline-variant/40 medium:grid-cols-3">
          {items.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-3 bg-card p-6">
              <Icon aria-hidden className="size-7 text-primary" />
              <h3 className="text-base font-medium">{title}</h3>
              <p className="text-sm text-on-surface-variant">{text}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

function FinalCall() {
  return (
    <div className="mx-auto max-w-300 px-4 pb-8 medium:px-6">
      <Reveal>
        <section
          aria-labelledby="landing-cta"
          className="relative isolate grid items-center gap-6 overflow-hidden rounded-[36px] bg-primary-container px-6 py-10 text-on-primary-container min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] min-[900px]:px-12"
        >
          <div
            aria-hidden
            className="landing-blob absolute -right-20 -bottom-24 -z-10 size-96 rounded-full bg-ai/30 blur-3xl"
          />
          <div className="flex flex-col items-start gap-4">
            <h2
              id="landing-cta"
              className="font-heading text-[32px] leading-10 font-[560] text-balance [font-variation-settings:'ROND'_60]"
            >
              Set up your company in an afternoon.
            </h2>
            <p className="max-w-120 text-base">
              Create a workspace, describe the company, connect Drive and invite People Ops. Setup
              walks you through every step, and you can stop and pick it up later.
            </p>
            <Button size="md" nativeButton={false} render={<a href={SIGN_UP_PATH} />}>
              Sign up your company <ArrowForwardIcon aria-hidden />
            </Button>
          </div>
          <BrandArt />
        </section>
      </Reveal>
    </div>
  );
}
