import type { EntityType } from "./types.js";
import firstnames from "../data/alias-firstnames.json" with { type: "json" };
import surnames from "../data/alias-surnames.json" with { type: "json" };
import companies from "../data/alias-companies.json" with { type: "json" };

let genericCounters: Record<string, number> = {
  person: 0,
  company: 0,
  address: 0,
  city: 0,
  email: 0,
  phone: 0,
};

/** Reset counters for a new document session. */
export function resetAliasCounters(): void {
  for (const key of Object.keys(genericCounters)) {
    genericCounters[key] = 0;
  }
}

/**
 * Generate an alias for an entity. Reuses existing alias if the same
 * original text was already aliased (consistency within a session).
 */
export function generateAlias(
  type: EntityType,
  originalText: string,
  aliasMap: Map<string, string>,
  style: "realistic" | "generic" = "realistic"
): string {
  // Consistency: same input → same output within session
  const existing = aliasMap.get(originalText);
  if (existing) return existing;

  let alias: string;
  if (style === "generic") {
    alias = generateGenericAlias(type);
  } else {
    alias = generateRealisticAlias(type, originalText);
  }

  aliasMap.set(originalText, alias);
  return alias;
}

function generateGenericAlias(type: EntityType): string {
  const labels: Record<string, string> = {
    person: "Personne",
    company: "Société",
    address: "Adresse",
    city: "Ville",
    email: "email",
    phone: "téléphone",
    iban: "IBAN",
    ssn: "NIR",
    unknown: "Entité",
  };
  const label = labels[type] ?? "Entité";
  const n = ++genericCounters[type] || 1;
  if (type === "email") return `personne${n}@exemple.fr`;
  if (type === "phone") return `+33 X XX XX XX X${n}`;
  if (type === "iban") return `FRXX XXXX XXXX XXXX XXXX XXX${n}`;
  if (type === "ssn") return `X XX XX XX XXX XXX X${n}`;
  return `${label} ${n}`;
}

function generateRealisticAlias(type: EntityType, original: string): string {
  switch (type) {
    case "person":
      return generatePersonAlias(original);
    case "company":
      return generateCompanyAlias(original);
    case "address":
      return generateAddressAlias(original);
    case "city":
      return pickRandom(CITY_POOL);
    case "email":
      return generateEmailAlias();
    case "phone":
      return generatePhoneAlias(original);
    case "iban":
      return maskWithX(original);
    case "ssn":
      return maskWithX(original);
    default:
      return `[${original.substring(0, 3)}...]`;
  }
}

function generatePersonAlias(original: string): string {
  const parts = original.split(/[\s-]+/);
  if (parts.length >= 2) {
    return `${pickRandom(firstnames.M.concat(firstnames.F))} ${pickRandom(surnames)}`;
  }
  // Single word — could be first name or surname
  if (original === original.toUpperCase()) {
    return pickRandom(surnames).toUpperCase();
  }
  return pickRandom(firstnames.M.concat(firstnames.F));
}

function generateCompanyAlias(original: string): string {
  // Try to preserve legal form prefix
  const legalFormRegex = /^(SCI|SARL|SAS|SA|EURL|SASU|LLC|LTD|GMBH|AG|INC|CORP)\b/i;
  const match = original.match(legalFormRegex);
  if (match) {
    const form = match[1];
    return `${form} ${pickRandom(companies.standalone)}`;
  }
  return `${pickRandom(companies.prefixes)} ${pickRandom(companies.suffixes)}`;
}

function generateAddressAlias(original: string): string {
  const num = Math.floor(Math.random() * 150) + 1;
  const streets = ["rue", "avenue", "boulevard", "place", "chemin"];
  const names = [
    "des Tilleuls", "du Commerce", "Victor Hugo", "de la Paix",
    "Jean Jaurès", "Pasteur", "Gambetta", "de la Gare",
    "des Lilas", "du Marché", "de la République",
  ];
  return `${num} ${pickRandom(streets)} ${pickRandom(names)}`;
}

function generateEmailAlias(): string {
  const fn = pickRandom(firstnames.M.concat(firstnames.F)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sn = pickRandom(surnames).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const domains = ["email.fr", "courrier.net", "boite.org", "exemple.com"];
  return `${fn}.${sn}@${pickRandom(domains)}`;
}

function generatePhoneAlias(original: string): string {
  // Keep same format, randomize digits
  if (/^\+33/.test(original) || /^0[1-9]/.test(original)) {
    const d = () => String(Math.floor(Math.random() * 90) + 10);
    return `+33 6 ${d()} ${d()} ${d()} ${d()}`;
  }
  if (/^\+44/.test(original)) {
    const d = () => String(Math.floor(Math.random() * 900) + 100);
    return `+44 ${d()} ${d()} ${d()}`;
  }
  return original.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
}

function maskWithX(text: string): string {
  // Keep first 4 chars (country code + check digits), mask the rest
  return text.replace(/[\dA-Z]/g, (ch, i) => (i < 4 ? ch : "X"));
}

const CITY_POOL = [
  "Bordeaux", "Nantes", "Strasbourg", "Montpellier", "Rennes",
  "Lille", "Reims", "Toulon", "Grenoble", "Dijon",
  "Angers", "Clermont-Ferrand", "Brest", "Tours", "Amiens",
  "Metz", "Perpignan", "Orléans", "Caen", "Rouen",
  "Manchester", "Birmingham", "Bristol", "Leeds", "Glasgow",
  "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart",
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
