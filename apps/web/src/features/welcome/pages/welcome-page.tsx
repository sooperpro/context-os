import type { MyRoadmap, ReminderChannel, Welcome } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Brand } from "@/components/layout/brand";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  AddIcon,
  ArrowBackIcon,
  ArrowForwardIcon,
  CheckCircleIcon,
  CheckIcon,
  FavoriteIcon,
  HubFilledIcon,
  HubIcon,
  PlayArrowFilledIcon,
  RouteIcon,
  VerifiedIcon,
  WavingHandIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Shape } from "@/components/ui/shape";
import { Stepper, StepperItem } from "@/components/ui/stepper";
import { roadmapQuery } from "@/features/learning/api/learning.queries";
import { useCompleteWelcome, welcomeQuery } from "@/features/welcome/api/welcome.queries";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { daysFromToday, formatDayDate, formatShortDate } from "@/lib/format";

const STEPS = ["Welcome", "Your profile", "Your first 90 days"] as const;

const RELATION: Record<Welcome["people"][number]["relation"], string> = {
  manager: "Your manager",
  buddy: "Your onboarding buddy",
  people_partner: "Your people partner",
};

const REMINDERS: Array<[ReminderChannel, string, string]> = [
  ["slack", "Slack", "Direct messages from ContextOS"],
  ["email", "Email", "One email per reminder"],
  ["both", "Both", "Slack and email"],
];

/**
 * The first-day welcome (prototype `#welcome`), full screen before the app: who will help, the
 * profile teammates see, and the plan for the first 90 days. Finishing saves the profile.
 */
export function WelcomePage() {
  const welcome = useQuery(welcomeQuery());
  const roadmap = useQuery(roadmapQuery());
  if (welcome.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-shell">
        <Loader label="Getting your first day ready" />
      </div>
    );
  }
  if (!welcome.data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-shell p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-base">Your welcome could not be loaded.</p>
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to my dashboard
          </Button>
        </div>
      </div>
    );
  }
  return <Wizard welcome={welcome.data} roadmap={roadmap.data} />;
}

function Wizard({ welcome, roadmap }: { welcome: Welcome; roadmap: MyRoadmap | undefined }) {
  const navigate = useNavigate();
  const workspace = useQuery(currentWorkspaceQuery());
  const complete = useCompleteWelcome();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(welcome.profile);
  const company = workspace.data?.name;

  const finish = (to: string) =>
    complete.mutate(
      { ...profile, preferredName: profile.preferredName.trim() || welcome.profile.preferredName },
      {
        onSuccess: () => {
          toast.success(
            company ? `You’re all set. Welcome to ${company}!` : "You’re all set. Welcome!",
          );
          void navigate(to);
        },
        onError: () => toast.error("Your profile could not be saved. Please try again."),
      },
    );

  return (
    <div className="flex min-h-dvh flex-col bg-shell text-on-surface">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-outline-variant/40 px-5 py-3.5 medium:px-8">
        <Brand />
        <Stepper
          aria-label="Steps"
          className="order-3 w-full medium:order-none medium:w-auto medium:flex-1"
        >
          {STEPS.map((label, index) => (
            <StepperItem
              key={label}
              index={index + 1}
              status={index < step ? "done" : index === step ? "current" : "upcoming"}
              connector={index < STEPS.length - 1}
            >
              {label}
            </StepperItem>
          ))}
        </Stepper>
        <Button
          variant="ghost"
          size="xs"
          className="ms-auto medium:ms-0"
          nativeButton={false}
          render={<Link to="/" />}
        >
          Skip for now
        </Button>
      </header>

      <main className="@container mx-auto flex w-full max-w-240 flex-1 flex-col gap-6 px-5 py-8 medium:px-8 medium:py-12">
        {step === 0 ? (
          <StepWelcome
            welcome={welcome}
            name={profile.preferredName || welcome.profile.preferredName}
            company={company}
          />
        ) : step === 1 ? (
          <StepProfile welcome={welcome} profile={profile} onChange={setProfile} />
        ) : (
          <StepPlan welcome={welcome} roadmap={roadmap} known={profile.known.length} />
        )}
      </main>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/40 bg-shell px-5 py-3.5 medium:px-8">
        {step ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowBackIcon aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button
            size="md"
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !profile.preferredName.trim()}
          >
            {step === 0 ? "Get started" : "Continue"} <ArrowForwardIcon aria-hidden />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="outline"
              disabled={complete.isPending}
              onClick={() => finish("/")}
            >
              Go to my dashboard
            </Button>
            <Button size="md" disabled={complete.isPending} onClick={() => finish("/roadmap")}>
              <PlayArrowFilledIcon aria-hidden /> Open my roadmap
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}

function StepWelcome({
  welcome,
  name,
  company,
}: {
  welcome: Welcome;
  name: string;
  company: string | undefined;
}) {
  const today = daysFromToday(welcome.firstDay) === 0;
  return (
    <>
      <div className="flex flex-col items-start gap-5 @min-[640px]:flex-row @min-[640px]:items-center">
        <span
          aria-hidden
          className="relative grid size-20 shrink-0 place-items-center text-on-primary-container"
        >
          <Shape kind="cookie9" className="absolute inset-0 size-full text-primary-container" />
          <WavingHandIcon className="relative z-10 size-9" />
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-on-surface-variant">
            {today
              ? `${formatDayDate(welcome.firstDay)} · your first day`
              : `You started on ${formatDayDate(welcome.firstDay)}`}
          </p>
          <h1 className="font-heading text-[36px] leading-11 font-semibold tracking-tight">
            Welcome{company ? ` to ${company}` : ""}, {name}
          </h1>
          <p className="text-lg">
            You’re joining the <b className="font-semibold">{welcome.team} team</b> as a{" "}
            <b className="font-semibold">{welcome.title}</b>. These {welcome.people.length} people
            will help you most.
          </p>
        </div>
      </div>
      <ul aria-label="People who will help you" className="grid gap-3 @min-[640px]:grid-cols-3">
        {welcome.people.map((entry) => (
          <li key={entry.person.id} className="flex items-start gap-3 rounded-2xl bg-card p-4">
            <PersonAvatar person={entry.person} size="lg" />
            <span className="flex min-w-0 flex-col">
              <b className="font-heading text-base font-medium">{entry.person.name}</b>
              <span className="text-xs font-medium text-on-surface-variant">
                {RELATION[entry.relation]}
              </span>
              <span className="text-xs">{entry.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <h2 className="font-heading text-xl font-medium">What ContextOS does</h2>
      <div className="grid gap-3 @min-[640px]:grid-cols-3">
        {(
          [
            [
              RouteIcon,
              "A roadmap made for you",
              "Weeks of modules, practical tasks and checks, built from your team’s template and adjusted by your manager.",
              false,
            ],
            [
              HubIcon,
              "The company’s knowledge",
              "Products, projects, systems and decisions, connected to the people who own them.",
              false,
            ],
            [
              HubFilledIcon,
              "Context Bot",
              "Ask anything. Answers cite their sources, and it tells you when it doesn’t know.",
              true,
            ],
          ] as const
        ).map(([Icon, title, text, ai]) => (
          <div
            key={title}
            className={cn(
              "flex flex-col gap-2 rounded-2xl p-5",
              ai ? "bg-ai-container/50" : "bg-card",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-10 place-items-center rounded-md [&_svg]:size-5",
                ai ? "bg-ai text-on-ai" : "bg-secondary-container text-on-secondary-container",
              )}
            >
              <Icon />
            </span>
            <b className="font-heading text-base font-medium">{title}</b>
            <p className="text-sm text-on-surface-variant">{text}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function StepProfile({
  welcome,
  profile,
  onChange,
}: {
  welcome: Welcome;
  profile: Welcome["profile"];
  onChange: (profile: Welcome["profile"]) => void;
}) {
  const ids = { name: useId(), pronouns: useId(), title: useId(), location: useId() };
  const set = (patch: Partial<Welcome["profile"]>) => onChange({ ...profile, ...patch });
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight">
          Set up your profile
        </h1>
        <p className="text-base text-on-surface-variant">
          Your teammates see this in People. You can change it any time in Settings.
        </p>
      </div>
      <div className="grid gap-4 @min-[640px]:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.name}>What should people call you?</Label>
          <Input
            id={ids.name}
            value={profile.preferredName}
            onChange={(event) => set({ preferredName: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.pronouns}>Pronouns (optional)</Label>
          <Input
            id={ids.pronouns}
            value={profile.pronouns}
            placeholder="e.g. she/her"
            onChange={(event) => set({ pronouns: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.title}>Job title</Label>
          <Input id={ids.title} value={`${welcome.title} · ${welcome.team}`} readOnly />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.location}>Where are you based?</Label>
          <Input
            id={ids.location}
            value={profile.location}
            onChange={(event) => set({ location: event.target.value })}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What do you already know well?</legend>
        <p className="text-xs text-on-surface-variant">
          We’ll mark matching modules as optional, so you can skip what you know.
        </p>
        <div className="flex flex-wrap gap-2">
          {welcome.knownOptions.map((topic) => {
            const on = profile.known.includes(topic);
            return (
              <Chip
                key={topic}
                variant="filter"
                selected={on}
                onClick={() =>
                  set({
                    known: on
                      ? profile.known.filter((entry) => entry !== topic)
                      : [...profile.known, topic],
                  })
                }
              >
                {on ? <CheckIcon aria-hidden /> : <AddIcon aria-hidden />}
                {topic}
              </Chip>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Where should reminders go?</legend>
        <OptionList orientation="horizontal">
          {REMINDERS.map(([value, title, description]) => (
            <OptionTile
              key={value}
              input={
                <input
                  type="radio"
                  name="reminders"
                  checked={profile.reminders === value}
                  onChange={() => set({ reminders: value })}
                />
              }
              title={title}
              description={description}
            />
          ))}
        </OptionList>
      </fieldset>
    </>
  );
}

function StepPlan({
  welcome,
  roadmap,
  known,
}: {
  welcome: Welcome;
  roadmap: MyRoadmap | undefined;
  known: number;
}) {
  const manager = welcome.people
    .find((entry) => entry.relation === "manager")
    ?.person.name.split(" ")[0];
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] leading-9 font-semibold tracking-tight">
          Your first 90 days
        </h1>
        <p className="text-base text-on-surface-variant">
          Here’s the plan {manager ? `${manager} and People Ops` : "your manager and People Ops"}{" "}
          agreed for you.
          {known
            ? ` ${known === 1 ? "1 topic" : `${known} topics`} you know ${known === 1 ? "is" : "are"} marked optional.`
            : ""}
        </p>
      </div>
      <ol aria-label="Stages" className="flex flex-col gap-0.5">
        {(roadmap?.stages ?? []).map((stage, index) => (
          <li
            key={stage.id}
            className={cn(
              "flex items-start gap-4 rounded-xs bg-card px-4 py-3.5 first:rounded-t-2xl",
              index === 0 &&
                "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-primary)_40%,transparent)]",
            )}
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
            >
              {index + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <b className="font-heading text-base font-medium">{stage.name}</b>
              <span className="text-xs font-medium text-on-surface-variant">
                {stage.weekStart === stage.weekEnd
                  ? `Week ${stage.weekStart}`
                  : `Weeks ${stage.weekStart}–${stage.weekEnd}`}{" "}
                · {formatShortDate(stage.startsOn)} to {formatShortDate(stage.endsOn)}
              </span>
              <span className="text-sm">{stage.goal}</span>
            </span>
          </li>
        ))}
        {roadmap?.probationReviewOn ? (
          <li className="flex items-start gap-4 rounded-xs rounded-b-2xl bg-card px-4 py-3.5">
            <span
              aria-hidden
              className="relative grid size-8 shrink-0 place-items-center text-on-primary-container"
            >
              <Shape kind="cookie4" className="absolute inset-0 size-full text-primary-container" />
              <VerifiedIcon className="relative z-10 size-4" />
            </span>
            <span className="flex flex-col gap-0.5">
              <b className="font-heading text-base font-medium">Probation review</b>
              <span className="text-xs font-medium text-on-surface-variant">
                Day 90 · {formatDayDate(roadmap.probationReviewOn)}
              </span>
              <span className="text-sm">
                You, {manager ?? "your manager"} and People Ops review how it’s gone.
              </span>
            </span>
          </li>
        ) : null}
      </ol>
      <div className="grid gap-4 @min-[640px]:grid-cols-2">
        {(
          [
            ["What’s expected", welcome.expectations, CheckCircleIcon, "text-success"],
            ["How you’re supported", welcome.support, FavoriteIcon, "text-primary"],
          ] as const
        ).map(([title, lines, Icon, tone]) => (
          <section key={title} className="flex flex-col gap-3 rounded-2xl bg-card p-5">
            <h2 className="font-heading text-base font-medium">{title}</h2>
            <ul className="flex flex-col gap-2.5">
              {lines.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm">
                  <Icon className={cn("mt-px size-5 shrink-0", tone)} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
