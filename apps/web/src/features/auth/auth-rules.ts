/** A light check before asking Clerk; Clerk validates the address properly. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The Clerk instance's minimum password length (Dashboard → User & authentication → Password). */
export const PASSWORD_MIN_LENGTH = 15;

/** What Clerk returns for a field or a whole request; people read `longMessage` when there is one. */
interface ClerkMessage {
  message: string;
  longMessage?: string;
}

export function messageOf(error: ClerkMessage | null | undefined): string | null {
  return error ? (error.longMessage ?? error.message) : null;
}
