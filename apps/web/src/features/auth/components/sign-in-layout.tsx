import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { GroupFilledIcon, RouteIcon, SmartToyFilledIcon } from "@/components/ui/icons";
import { Shape } from "@/components/ui/shape";

/**
 * Full-screen sign-in and first-day frame, from the prototype (`.fr-signin`): a primary-container
 * brand panel with expressive shapes and the pitch on the left, a card on the right. The sign-in
 * form, the workspace chooser (or any other content) renders inside the card.
 */
interface SignInLayoutProps {
  /** Card heading, e.g. "Sign in" or "Choose your workspace". */
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function SignInLayout({ title, description, children }: SignInLayoutProps) {
  return (
    <div className="grid min-h-svh bg-shell lg:h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:overflow-hidden">
      <section
        aria-label="About ContextOS"
        className="flex flex-col gap-3 overflow-hidden rounded-b-3xl bg-primary-container px-5 pt-5 pb-7 text-on-primary-container lg:h-full lg:gap-6 lg:rounded-r-4xl lg:rounded-bl-none lg:px-10 lg:pt-8 lg:pb-12"
      >
        <Brand className="self-start text-on-primary-container" />
        <BrandArt />
        <div className="mt-auto flex max-w-130 flex-col gap-3">
          <h1 className="font-heading text-[26px] leading-[34px] font-[520] text-balance [font-variation-settings:'ROND'_60] lg:text-[36px] lg:leading-11">
            Everything you need to know about your company, in one place.
          </h1>
          <p className="text-base">
            Your onboarding roadmap, the company's knowledge, and answers with sources, from day
            one.
          </p>
        </div>
      </section>

      <main className="flex flex-col items-center justify-center gap-4 px-4 py-6 lg:overflow-y-auto lg:px-6 lg:py-10">
        <div className="flex w-full max-w-105 flex-col gap-4 rounded-2xl bg-card px-5 py-6 lg:p-8">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-[28px] leading-9 font-[520] [font-variation-settings:'ROND'_60]">
              {title}
            </h2>
            {description ? <p className="text-sm text-on-surface-variant">{description}</p> : null}
          </div>
          {children}
        </div>
        <p className="max-w-105 text-center text-xs text-on-surface-variant">
          Sign in with your work account. ContextOS only shows what your accounts can already open.
        </p>
      </main>
    </div>
  );
}

/** Five expressive shapes with three icons: roadmap, Context Bot, people. Slow spins, off when motion is reduced. */
export function BrandArt() {
  return (
    <div
      aria-hidden
      className="relative h-36 w-full max-w-70 self-center lg:h-auto lg:max-h-72 lg:min-h-40 lg:max-w-115 lg:flex-1"
    >
      <div className="absolute top-[12%] left-[6%] grid w-[46%] place-items-center">
        <Shape
          kind="cookie9"
          className="col-start-1 row-start-1 w-full text-primary motion-safe:animate-[spin_60s_linear_infinite]"
        />
        <RouteIcon className="relative z-10 col-start-1 row-start-1 h-auto w-[40%] text-primary-foreground" />
      </div>
      <div className="absolute top-0 right-[8%] grid w-[30%] place-items-center">
        <Shape
          kind="clover4"
          className="col-start-1 row-start-1 w-full text-ai-container motion-safe:animate-[spin_40s_linear_infinite_reverse]"
        />
        <SmartToyFilledIcon className="relative z-10 col-start-1 row-start-1 h-auto w-[40%] text-on-ai-container" />
      </div>
      <div className="absolute right-[14%] bottom-[4%] grid w-[26%] place-items-center">
        <Shape
          kind="sunny"
          className="col-start-1 row-start-1 w-full text-surface-container-lowest motion-safe:animate-[spin_50s_linear_infinite]"
        />
        <GroupFilledIcon className="relative z-10 col-start-1 row-start-1 h-auto w-[40%] text-primary" />
      </div>
      <div className="absolute bottom-[10%] left-[40%] aspect-[2.4] w-[30%] -rotate-[18deg] rounded-full bg-inverse-primary" />
      <Shape kind="flower" className="absolute bottom-[6%] left-0 w-[12%] text-ai" />
    </div>
  );
}
