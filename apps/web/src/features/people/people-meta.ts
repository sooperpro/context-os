import type { DirectoryPerson, TeamArea } from "@contextos/shared";
import {
  AdminPanelSettingsIcon,
  Diversity3Icon,
  DnsIcon,
  GroupsIcon,
  HandshakeIcon,
  LocalShippingIcon,
  MonitoringIcon,
  PaletteIcon,
  PaymentsIcon,
  StarIcon,
  SupportAgentIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { daysFromToday } from "@/lib/format";

/** How people and teams read wherever they appear. Data, not components. */
export const TEAM_AREA_ICON: Record<TeamArea, MaterialIcon> = {
  engineering: DnsIcon,
  finance: PaymentsIcon,
  product: LocalShippingIcon,
  data: MonitoringIcon,
  design: PaletteIcon,
  support: SupportAgentIcon,
  sales: HandshakeIcon,
  people: Diversity3Icon,
  it: AdminPanelSettingsIcon,
  leadership: StarIcon,
  other: GroupsIcon,
};

export type BadgeTone = "info" | "ai" | "success" | "warning" | "neutral";

/** The prototype's badges, relative to the viewer: You, Your manager, Your buddy, New, Expert. */
export function personBadges(person: DirectoryPerson): Array<{ label: string; tone: BadgeTone }> {
  const badges: Array<{ label: string; tone: BadgeTone }> = [];
  if (person.relations.includes("you")) badges.push({ label: "You", tone: "info" });
  if (person.relations.includes("manager")) badges.push({ label: "Your manager", tone: "info" });
  if (person.relations.includes("buddy")) badges.push({ label: "Your buddy", tone: "ai" });
  if (person.relations.includes("report")) badges.push({ label: "Reports to you", tone: "info" });
  if (person.joinedOn && daysFromToday(person.joinedOn) > 0) badges.push({ label: "Starting soon", tone: "neutral" });
  else if (person.isNew) badges.push({ label: "New", tone: "success" });
  if (person.expert) badges.push({ label: "Expert", tone: "warning" });
  return badges;
}

/** "Product Engineer · Platform", unless the title already names the team. */
export function roleAndTeam(person: Pick<DirectoryPerson, "title" | "team">): string {
  if (!person.team || person.title.includes(person.team.name)) return person.title;
  return `${person.title} · ${person.team.name}`;
}

export const peoplePath = (id: string) => `/people/${encodeURIComponent(id)}`;
