import type { ContextItem, Verification } from "@contextos/shared";
import { Button } from "@/components/ui/button";
import { TypeChip } from "@/components/ui/meta-chip";
import { useSetVerification } from "@/features/hub/api/hub.queries";
import { StateBadge } from "@/features/hub/components/badges";
import { DECISION_STATUS_LABEL } from "@/lib/labels";

/* Pieces of a context item shared by its card in the hub tabs and its own page. */

/** Confirm, mark stale or dispute: people keep derived knowledge honest. */
export function VerificationControls({
  projectId,
  item,
}: {
  projectId: string;
  item: ContextItem;
}) {
  const verify = useSetVerification(projectId);
  const set = (verification: Verification) => verify.mutate({ itemId: item.id, verification });
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Verification">
      <VerifyButton
        label="Confirm"
        active={item.verification === "confirmed"}
        disabled={verify.isPending}
        onClick={() => set("confirmed")}
      />
      <VerifyButton
        label="Mark stale"
        active={item.verification === "stale"}
        disabled={verify.isPending}
        onClick={() => set("stale")}
      />
      <VerifyButton
        label="Dispute"
        active={item.verification === "disputed"}
        disabled={verify.isPending}
        onClick={() => set("disputed")}
      />
    </div>
  );
}

function VerifyButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="xs"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function KindBadge({ item }: { item: ContextItem }) {
  switch (item.kind) {
    case "decision":
      return <TypeChip>{DECISION_STATUS_LABEL[item.data.decisionStatus]}</TypeChip>;
    case "event":
      return <TypeChip className="capitalize">{item.data.category}</TypeChip>;
    case "status_claim":
      return <StateBadge state={item.data.state} />;
    case "component":
      return <TypeChip className="capitalize">{item.data.componentType}</TypeChip>;
    case "dependency":
      return <TypeChip>{item.data.relation.replace("_", " ")}</TypeChip>;
    default:
      return null;
  }
}

export function ItemDetails({ item }: { item: ContextItem }) {
  switch (item.kind) {
    case "decision": {
      const { rationale, alternatives, participants, consequences } = item.data;
      if (!rationale && alternatives.length === 0 && participants.length === 0 && !consequences) {
        return null;
      }
      return (
        <dl className="grid gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {rationale ? (
            <>
              <dt className="text-muted-foreground">Why</dt>
              <dd>{rationale}</dd>
            </>
          ) : null}
          {alternatives.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Alternatives</dt>
              <dd>{alternatives.join(", ")}</dd>
            </>
          ) : null}
          {participants.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Participants</dt>
              <dd>{participants.join(", ")}</dd>
            </>
          ) : null}
          {consequences ? (
            <>
              <dt className="text-muted-foreground">Consequences</dt>
              <dd>{consequences}</dd>
            </>
          ) : null}
        </dl>
      );
    }
    case "person":
      return item.data.owns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Owns</span>
          {item.data.owns.map((area) => (
            <TypeChip key={area}>{area}</TypeChip>
          ))}
        </div>
      ) : null;
    case "dependency":
      return (
        <p className="text-sm">
          <span className="font-medium">{item.data.from}</span>{" "}
          <span className="text-muted-foreground">{item.data.relation.replace("_", " ")}</span>{" "}
          <span className="font-medium">{item.data.to}</span>
        </p>
      );
    default:
      return null;
  }
}
