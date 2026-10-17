/**
 * Topics ContextOS never answers, for any role (role access spec §4.10 and §6 rule 5): pay, bonus,
 * performance ratings and disciplinary records. Checked before retrieval, so nothing is searched.
 */
const RESTRICTED_TOPIC =
  /\b(salar(?:y|ies)|compensation|payroll|pay (?:rise|raise|band|bands|grade|grades|scale)|bonus(?:es)?|wages?|paychecks?|paycheques?|payslips?|pay ?slips?|pay ?stubs?|performance (?:review|reviews|rating|ratings)|disciplinary|termination)\b/i;

/** After "paid": what makes it a product, a benefit or a bill rather than someone's pay. */
const NOT_PAY = String.raw`(?!\s+(?:plans?|tiers?|versions?|accounts?|subscriptions?|features?|seats?|licen[cs]es?|users?|customers?|trials?|add-?ons?|options?|products?|apps?|services?|offerings?|memberships?|courses?|content|leave|time|holidays?|vacation|sick|parental|maternity|paternity|media|search|social|ads?|campaigns?|acquisition|traffic|channels?|upgrades?|invoices?|work|with|by|via|through|off|back|up)\b)`;
/** Before "earn": the business earning revenue, not a person ("what did we earn last quarter"). */
const NOT_PERSON = String.raw`(?!(?:the\s+|our\s+|this\s+|that\s+|each\s+)?(?:products?|company|business|plans?|apps?|services?|campaigns?|features?|launch|deals?|accounts?|customers?|it|this|that|we)\b)`;
/** Who: one to three words ("Sam", "Sam Lee", "the new PMs"). */
const WHO = String.raw`(?:[\w'’.-]+\s+){1,3}`;
const ASK = String.raw`\b(?:how\s+much|what)\s+(?:money\s+)?(?:is|are|was|were|does|do|did|will|would|should|can)\s+`;

/**
 * How much someone is paid, asked without the words above: "What is Sam paid?", "how much does
 * Priya earn?", "What do PMs get paid here?", "Sam's pay", "is Sam paid more than Priya?".
 */
const PAY_QUESTION = new RegExp(
  [
    String.raw`${ASK}${WHO}(?:(?:get|gets|got|getting|being)\s+)?paid\b${NOT_PAY}`,
    String.raw`${ASK}${NOT_PERSON}${WHO}(?:earn(?:s|ed)?|make(?:s)?\s+(?:a|an|per)\s+(?:year|month|week|day|hour))\b`,
    String.raw`\bwhat['’]s\s+${WHO}paid\b${NOT_PAY}`,
    String.raw`\bwhat['’]s\s+${NOT_PERSON}${WHO}earning\b`,
    String.raw`\b(?:[\w-]+['’]s|my|his|her|their)\s+(?:pay|take-home)\b(?!\s+(?:plans?|tiers?|walls?|buttons?|pages?|links?|gateways?|methods?|flows?|api|endpoints?|screens?|forms?)\b)`,
    String.raw`\b(?:paid|earns?|earning)\s+(?:(?:a\s+lot|much|way|far)\s+)?(?:more|less)\s+than\b`,
  ].join("|"),
  "i",
);

export const isRestrictedTopic = (question: string) =>
  RESTRICTED_TOPIC.test(question) || PAY_QUESTION.test(question);

export const RESTRICTED_ANSWER =
  "Pay, performance and disciplinary records aren't available in ContextOS, so I can't answer this. For questions about your own pay or benefits, contact your People partner.";
