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
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "rounded-2xl",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
