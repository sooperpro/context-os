import type { ContextItemKind, SourceKind } from "@contextos/shared";
import {
  AccountTreeIcon,
  ArticleIcon,
  Book2Icon,
  ConfirmationNumberIcon,
  DescriptionIcon,
  FlagIcon,
  ForumIcon,
  GavelIcon,
  LinkIcon,
  MergeTypeIcon,
  PersonIcon,
  SyncAltIcon,
  type MaterialIcon,
} from "@/components/ui/icons";

/** One icon per context item kind, used wherever a kind is named. */
export const KIND_ICON: Record<ContextItemKind, MaterialIcon> = {
  decision: GavelIcon,
  event: FlagIcon,
  status_claim: SyncAltIcon,
  person: PersonIcon,
  component: AccountTreeIcon,
  dependency: LinkIcon,
  term: Book2Icon,
};

/** One icon per source kind. */
export const SOURCE_KIND_ICON: Record<SourceKind, MaterialIcon> = {
  document: ArticleIcon,
  conversation: ForumIcon,
  ticket: ConfirmationNumberIcon,
  pull_request: MergeTypeIcon,
  note: DescriptionIcon,
};
