// The single data-source seam (provider interface, design doc 7.3 / D18). Slice 1
// serves the offline mock; Slice 4 swaps the bodies for a fetch against /bundle.
// Nothing else in the app touches the data source -- this is the only swap point.

import type { ScoringBundle } from "../types/contracts";
import mock from "../mock/bundle.json";

/** One ScoringBundle per (ticker, expiration). Slice 1 ignores the symbol. */
export async function loadBundle(_symbol: string): Promise<ScoringBundle> {
  return mock as unknown as ScoringBundle;
}

/** Available expirations for the symbol (Slice 1: just the mock's one). */
export async function loadExpirations(_symbol: string): Promise<string[]> {
  return [mock.meta.expiration];
}

/** Lightweight spot quote, derived from the mock meta. */
export async function loadQuote(
  _symbol: string,
): Promise<{ symbol: string; spot: number; delayed: boolean }> {
  return {
    symbol: mock.meta.symbol,
    spot: mock.meta.spot,
    delayed: mock.meta.delayed,
  };
}
