import type { Theme } from "@/components/theme-context";
import { Button } from "@/components/ui/button";
import { DarkModeIcon, DesktopWindowsIcon, LightModeIcon } from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";

const ORDER: Theme[] = ["light", "dark", "system"];
const ICONS = { light: LightModeIcon, dark: DarkModeIcon, system: DesktopWindowsIcon } as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "system";
  const Icon = ICONS[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} theme`}
      title={`Theme: ${theme}`}
      onClick={() => setTheme(next)}
    >
      <Icon className="size-5" />
    </Button>
  );
}
