import profanity from "leo-profanity";

const HINGLISH_TERMS = [
  "chutiya",
  "chutia",
  "madarchod",
  "behenchod",
  "bhenchod",
  "randi",
  "gandu",
  "harami",
  "kutta",
  "kamina",
  "saala kutta",
  "bhosdike",
  "lodu",
  "chodu",
  "gaand",
  "चूतिया",
];

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "")
    .replace(/(.)\1+/g, "$1");
}

const normalizedHinglishTerms = HINGLISH_TERMS.map(normalize);

export function containsProfanity(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  const normalized = normalize(value);
  return (
    profanity.check(value) ||
    profanity.check(normalized) ||
    normalizedHinglishTerms.some((term) => normalized.includes(term))
  );
}
