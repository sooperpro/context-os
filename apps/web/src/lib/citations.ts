/** AI text without its `[n]` citation markers, for places that don't list the sources. */
export const stripCitations = (text: string) => text.replace(/\s?\[\d+\](?!\()/g, "");
