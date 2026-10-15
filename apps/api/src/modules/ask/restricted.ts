/**
 * Topics ContextOS never answers, for any role (role access spec §4.10 and §6 rule 5): pay, bonus,
 * performance ratings and disciplinary records. Checked before retrieval, so nothing is searched.
 */
const RESTRICTED_TOPIC =
  /\b(salar(?:y|ies)|compensation|payroll|pay (?:rise|raise|band|bands|grade|grades|scale)|bonus(?:es)?|performance (?:review|reviews|rating|ratings)|disciplinary|termination)\b/i;

export const isRestrictedTopic = (question: string) => RESTRICTED_TOPIC.test(question);

export const RESTRICTED_ANSWER =
  "Pay, performance and disciplinary records aren't available in ContextOS, so I can't answer this. For questions about your own pay or benefits, contact your People partner.";
