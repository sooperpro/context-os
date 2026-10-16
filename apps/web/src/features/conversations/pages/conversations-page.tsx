import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown";
import { SectionCard } from "@/components/section-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { personConversationsQuery } from "@/features/conversations/api/conversations.api";
import { membersQuery } from "@/features/members/api/members.queries";
import { formatDateTime } from "@/lib/format";
import { stripCitations } from "@/lib/citations";

/**
 * Owners read everything a member asked Context Bot (decided 16 Oct 2026: owners see everything).
 * Each read is written to the audit log, and Settings tells members that owners can read them.
 */
export function ConversationsPage() {
  const id = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const personId = searchParams.get("person");
  const members = useQuery(membersQuery());
  // Everyone with a membership, including people who have left: their history stays readable.
  const people = members.data ?? [];
  const items = Object.fromEntries(people.map((member) => [member.id, member.name]));
  const conversations = useQuery({
    ...personConversationsQuery(personId ?? ""),
    enabled: personId !== null,
  });
  const name = conversations.data?.person.name ?? (personId ? items[personId] : undefined);

  return (
    <div className="mx-auto flex max-w-240 flex-col gap-3 medium:gap-4">
      <PageHeader
        title="Member conversations"
        description="Everything a member asked Context Bot, newest first. Opening someone's conversations is written to the audit log, and Settings tells members that owners can read them."
      />
      <SectionCard title="Whose conversations" endpoint="/v1/users" status={members}>
        <div className="flex max-w-120 flex-col gap-1.5">
          <Label htmlFor={`${id}-person`}>Person</Label>
          <Select
            items={items}
            value={personId}
            onValueChange={(value) =>
              setSearchParams(value ? { person: String(value) } : {}, { replace: true })
            }
          >
            <SelectTrigger id={`${id}-person`} className="w-full">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>
      {personId ? (
        <SectionCard
          title={name ? `What ${name} asked` : "What they asked"}
          count={conversations.data?.items.length}
          endpoint="/v1/people/:id/conversations"
          status={conversations}
        >
          {conversations.data?.items.length ? (
            <ul className="flex flex-col divide-y divide-outline-variant" aria-label="Questions">
              {conversations.data.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5 py-4">
                  <span className="font-medium">{item.question}</span>
                  <Markdown
                    text={stripCitations(item.answer.answer)}
                    className="text-sm text-on-surface-variant"
                  />
                  <span className="text-xs text-on-surface-variant">
                    <Link to={`/projects/${item.project.id}`} className="hover:underline">
                      {item.project.name}
                    </Link>
                    {item.thread ? ` · Conversation “${item.thread.title}”` : ""}
                    {" · "}
                    {formatDateTime(item.askedAt)}
                    {item.helpful === null
                      ? ""
                      : item.helpful
                        ? " · Rated helpful"
                        : " · Rated not helpful"}
                  </span>
                </li>
              ))}
            </ul>
          ) : conversations.data ? (
            <p className="text-sm text-on-surface-variant">
              {name ?? "They"} hasn&rsquo;t asked Context Bot anything yet.
            </p>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
