import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import {
  CheckCircleFilledIcon,
  ErrorFilledIcon,
  InfoIcon,
  ProgressActivityIcon,
  WarningFilledIcon,
} from "@/components/ui/icons";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CheckCircleFilledIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningFilledIcon className="size-4" />,
        error: <ErrorFilledIcon className="size-4" />,
        loading: <ProgressActivityIcon className="size-4 animate-spin" />,
      }}
      style={
        {
          // Prototype snackbar: inverse surface, 12px corners, actions in inverse primary.
          "--normal-bg": "var(--color-inverse-surface)",
          "--normal-text": "var(--color-inverse-on-surface)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-md)",
          "--width": "min(35rem, calc(100vw - 2rem))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "min-h-12 shadow-elevation-3 text-sm",
          actionButton: "!bg-transparent !font-medium !text-inverse-primary",
          cancelButton: "!bg-transparent !text-inverse-on-surface",
          icon: "[&_svg]:!text-inverse-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
