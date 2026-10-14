import { toast } from "sonner";

/**
 * For controls whose screen or action is not built yet. The control stays where the reference puts
 * it and says so when used, instead of linking to a missing page. Search for `comingSoon(` to find
 * every one when the destination ships.
 */
export function comingSoon(what: string): void {
  toast(`${what} is coming soon.`);
}
