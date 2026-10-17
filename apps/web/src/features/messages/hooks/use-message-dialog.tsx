import type { DirectMessageInput } from "@contextos/shared";
import { useState } from "react";
import {
  MessageDialog,
  type MessageRecipient,
} from "@/features/messages/components/message-dialog";

/** One dialog per page: `message(person, about?)` opens it, `dialog` renders it. */
export function useMessageDialog() {
  const [target, setTarget] = useState<{
    to: MessageRecipient;
    about?: DirectMessageInput["about"];
  } | null>(null);
  return {
    message: (to: MessageRecipient, about?: DirectMessageInput["about"]) =>
      setTarget({ to, ...(about ? { about } : {}) }),
    dialog: (
      <MessageDialog
        to={target?.to ?? null}
        about={target?.about}
        onClose={() => setTarget(null)}
      />
    ),
  };
}
