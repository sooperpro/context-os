import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Small line above the title: counts or context, e.g. "1,035 pages from 5 sources". */
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 2 for pages nested under another page's main heading (the project hero). */
  level?: 1 | 2;
}

/**
 * Prototype page head: kicker (label-large), headline (display-small, emphasized: weight 520,
 * ROND 60, 30px in a narrow pane) and lede (body-large) on the left; actions bottom right.
 */
export function PageHeader({ title, kicker, description, actions, level = 1 }: PageHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1">
      <div className="flex max-w-195 min-w-0 flex-[1_1_420px] flex-col gap-1.5">
        {kicker ? <p className="text-sm font-medium text-on-surface-variant">{kicker}</p> : null}
        <Heading
          className={
            level === 1
              ? "font-heading text-[36px] leading-11 font-[520] tracking-[-0.25px] text-balance [font-variation-settings:'ROND'_60] @max-[640px]:text-[30px] @max-[640px]:leading-[38px]"
              : "font-heading text-2xl leading-8 font-semibold tracking-tight text-balance"
          }
        >
          {title}
        </Heading>
        {description ? (
          <p className="text-base text-on-surface-variant [&_b]:font-medium [&_b]:text-on-surface">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
