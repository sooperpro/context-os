import { Button } from "@/components/ui/button";
import { DarkModeIcon, LightModeIcon } from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";

/**
 * Light/dark switch as in the prototype: the icon shows the theme you will switch to. "System"
 * stays the default until the person chooses; a future settings page can hand control back.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const Icon = next === "dark" ? DarkModeIcon : LightModeIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-on-surface-variant"
      aria-label={`Switch to ${next} theme`}
      title={`${next === "dark" ? "Dark" : "Light"} theme`}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  );
}
