import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * Full-width tonal banner: icon, title and text, optional actions. 24px corners, wraps on phones.
 * Use for connector errors ("Jira sync is failing", with a Fix action) and in-progress notices.
 */
const bannerVariants = cva(
  "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl py-3.5 pr-4 pl-5 text-sm [&>svg]:size-6 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        error: "bg-error-container text-on-error-container",
        warning: "bg-warning-container text-on-warning-container",
        info: "bg-info-container text-on-info-container",
        success: "bg-success-container text-on-success-container",
        ai: "bg-ai-container text-on-ai-container",
        neutral: "bg-surface-container-high text-on-surface",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

interface BannerProps
  extends Omit<React.ComponentProps<"div">, "title">, VariantProps<typeof bannerVariants> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

function Banner({
  className,
  tone = "info",
  icon,
  title,
  description,
  actions,
  ...props
}: BannerProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-slot="banner"
      data-tone={tone}
      className={cn(bannerVariants({ tone }), className)}
      {...props}
    >
      {icon}
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="opacity-90">{description}</span> : null}
      </div>
      {/* Text buttons take the banner's color; filled ones (Reconnect, Resolve) keep their own. */}
      {actions ? (
        <div className="flex flex-wrap gap-2 [&_[data-variant=ghost]]:text-current [&_[data-variant=link]]:text-current [&_[data-variant=outline]]:text-current">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export { Banner, bannerVariants };
