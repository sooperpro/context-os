import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { PersonRefSchema } from "./refs.js";

/*
 * The first-day welcome (prototype `#welcome`): who will help, setting up a profile, and the first 90
 * days. The stages come from the person's roadmap (`GET /v1/me/roadmap`). The web app's development
 * mock layer answers these until they are served; docs/api-change-requests.md tracks them.
 */

export const ReminderChannelSchema = z.enum(["slack", "email", "both"]);
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;

const ProfileFields = {
  /** What people should call them. */
  preferredName: z.string().trim().min(1, "Add the name people should use.").max(100),
  pronouns: z.string().trim().max(40),
  location: z.string().trim().max(100),
  /** Topics they already know: matching modules become optional. */
  known: z.array(z.string().max(60)).max(20),
  reminders: ReminderChannelSchema,
};

/** `GET /v1/me/welcome`: the first-day screens for someone starting. */
export const WelcomeSchema = z.object({
  firstDay: z.iso.date(),
  title: z.string(),
  team: z.string(),
  /** Manager, buddy and people partner, and how each will help. */
  people: z.array(
    z.object({
      person: PersonRefSchema,
      relation: z.enum(["manager", "buddy", "people_partner"]),
      detail: z.string(),
    }),
  ),
  profile: z.object(ProfileFields),
  knownOptions: z.array(z.string()),
  expectations: z.array(z.string()),
  support: z.array(z.string()),
  /** Set once they finish (or skip) the welcome. */
  completedAt: IsoDateTimeSchema.nullable(),
});
export type Welcome = z.infer<typeof WelcomeSchema>;

/** `POST /v1/me/welcome`: save the profile and mark the welcome done. */
export const WelcomeInputSchema = z.object(ProfileFields).strict();
export type WelcomeInput = z.infer<typeof WelcomeInputSchema>;
