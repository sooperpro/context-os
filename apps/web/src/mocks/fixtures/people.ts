import type { PersonRef } from "@contextos/shared";

/** The prototype's cast, reused across every mocked screen so names stay consistent. */
const person = (id: string, name: string, title: string): PersonRef => ({ id, name, title });

export const people = {
  maya: person("p-maya", "Maya Okafor", "Product Engineer"),
  daniel: person("p-daniel", "Daniel Reyes", "Engineering Manager"),
  sana: person("p-sana", "Sana Iqbal", "Staff Engineer · Ingest gateway"),
  priya: person("p-priya", "Priya Nair", "Product Manager · Billing"),
  elena: person("p-elena", "Elena Brooks", "People Partner"),
  leah: person("p-leah", "Leah Park", "Backend Engineer"),
  chloe: person("p-chloe", "Chloe Martin", "Data Engineer"),
  arjun: person("p-arjun", "Arjun Mehta", "Site Reliability Engineer"),
  jonah: person("p-jonah", "Jonah Kim", "Site Reliability Engineer"),
  tom: person("p-tom", "Tom Becker", "IT & Workspace Admin"),
  sofia: person("p-sofia", "Sofia Alvarez", "Account Executive"),
  ben: person("p-ben", "Ben Carter", "Support Specialist"),
  hana: person("p-hana", "Hana Sato", "Product Designer"),
  ravi: person("p-ravi", "Ravi Kumar", "Data Analyst"),
  marcus: person("p-marcus", "Marcus Lee", "Sales Manager"),
  aisha: person("p-aisha", "Aisha Khan", "Support Manager"),
  owen: person("p-owen", "Owen Hughes", "Design Manager"),
  nina: person("p-nina", "Nina Osei", "Data Manager"),
  grace: person("p-grace", "Grace Liu", "Account Executive"),
  tomas: person("p-tomas", "Tomás Ruiz", "Support Specialist"),
  amara: person("p-amara", "Amara Diallo", "Finance Analyst"),
  ruth: person("p-ruth", "Ruth Adeyemi", "Finance Manager"),
  ivy: person("p-ivy", "Ivy Chen", "Product Manager · Track"),
  lena: person("p-lena", "Lena Fischer", "Backend Engineer"),
  omar: person("p-omar", "Omar Haddad", "Account Executive"),
  priyaShah: person("p-priya-shah", "Priya Shah", "Senior Support Specialist"),
} as const;
