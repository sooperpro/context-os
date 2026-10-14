import { InviteResultSchema, type InviteInput, type InviteResult } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export function inviteMember(input: InviteInput): Promise<InviteResult> {
  return apiRequest("/v1/users/invite", { method: "POST", body: input, schema: InviteResultSchema });
}
