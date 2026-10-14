import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Small line above the title: counts or context, e.g. "1,035 pages from 5 sources". */
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Prototype page head: kicker, headline, summary on the left; actions aligned to the bottom right. */
export function PageHeader({ title, kicker, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1">
      <div className="flex min-w-0 flex-col gap-1">
        {kicker ? <p className="text-xs font-medium tracking-wide text-on-surface-variant">{kicker}</p> : null}
        <h1 className="font-heading text-3xl leading-10 font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="max-w-[64ch] text-sm text-on-surface-variant">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
