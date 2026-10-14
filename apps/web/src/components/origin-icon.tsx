import type { KnowledgeOrigin } from "@contextos/shared";
import {
  ArticleIcon,
  CodeIcon,
  ConfirmationNumberIcon,
  DescriptionIcon,
  HubIcon,
  TagIcon,
} from "@/components/ui/icons";

const ICON = {
  google_drive: DescriptionIcon,
  github: CodeIcon,
  slack: TagIcon,
  jira: ConfirmationNumberIcon,
  confluence: ArticleIcon,
  knowledge_hub: HubIcon,
} as const;

/**
 * The icon for where knowledge came from, until brand logos are bundled (the prototype uses
 * connector logos here). Pair with KNOWLEDGE_ORIGIN_LABEL for the text.
 */
export function OriginIcon({
  origin,
  ...props
}: { origin: KnowledgeOrigin } & React.SVGProps<SVGSVGElement>) {
  const Icon = ICON[origin];
  return <Icon aria-hidden {...props} />;
}
