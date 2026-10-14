import { LanguageIcon } from "@/components/ui/icons";
import { LogoTile } from "@/components/ui/logo-tile";

/** Brand marks by file name (src/assets/logos, CC0). Vite fingerprints each as its own asset. */
const FILES = import.meta.glob<string>("../assets/logos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const url = (file: string) => FILES[`../assets/logos/${file}.svg`];

/** Provider id (as the API names it) → logo file. Providers without a brand mark get a generic icon. */
const LOGO: Record<string, string> = {
  "google-drive": "google-icon",
  google_drive: "google-icon",
  onedrive: "microsoft-onedrive",
  dropbox: "dropbox",
  box: "box",
  confluence: "confluence",
  notion: "notion-icon",
  slack: "slack-icon",
  teams: "microsoft-teams",
  zoom: "zoom-icon",
  loom: "loom-icon",
  github: "github-icon",
  gitlab: "gitlab-icon",
  bitbucket: "bitbucket",
  jira: "jira",
  linear: "linear-icon",
  asana: "asana-icon",
  figma: "figma",
  salesforce: "salesforce",
  zendesk: "zendesk-icon",
};

/** A connector's brand mark on the white logo tile (prototype `.logo-tile`). Decorative: name it in text. */
export function ConnectorLogo({
  provider,
  size,
}: {
  provider: string;
  size?: "sm" | "default" | "lg";
}) {
  const file = LOGO[provider];
  const src = file ? url(file) : undefined;
  return (
    <LogoTile size={size} aria-hidden>
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <LanguageIcon className="text-on-surface-variant" />
      )}
    </LogoTile>
  );
}
