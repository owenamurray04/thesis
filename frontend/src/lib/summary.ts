// One calm plain-english line describing a candidate's profit/risk shape.
// Sentence case, no emoji (design doc 12 anti-brief).

import type { BundleCandidate } from "../types/contracts";
import { usd, price } from "./format";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO date (2026-08-24) -> "Aug 24". Falls back to the raw string if unparseable. */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

export function plainEnglish(
  candidate: BundleCandidate,
  symbol: string,
  expiration: string,
): string {
  const when = shortDate(expiration);
  const bes = candidate.breakevens;
  const risk = usd(Math.abs(candidate.max_loss));

  // "make up to" clause -- show the number; if the gain dwarfs the capital it is
  // effectively open-ended, so phrase it as "a lot more".
  const openEnded =
    candidate.capital > 0 && candidate.max_gain > candidate.capital * 8;
  const upside = openEnded ? "much more" : usd(candidate.max_gain);

  let region: string;
  if (bes.length >= 2) {
    const lo = Math.min(...bes);
    const hi = Math.max(...bes);
    region = `is between $${price(lo)} and $${price(hi)}`;
  } else if (bes.length === 1) {
    // direction inferred from where the gain sits: gain at high prices -> above.
    const above = candidate.max_gain >= Math.abs(candidate.max_loss);
    region = `is ${above ? "above" : "below"} $${price(bes[0])}`;
  } else {
    region = "moves your way";
  }

  return `You profit if ${symbol} ${region} on ${when}; you risk ${risk} to make up to ${upside}.`;
}
