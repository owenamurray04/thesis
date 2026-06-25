// Sort bar (design doc 12.5). Five sort keys as 11px uppercase tracked labels,
// middot-separated. The active key reads in --text-1 with a 1px accent underline;
// the rest in --text-3. Click sets the sort. Names in Inter (labels, not numbers).

import type { SortKey } from "../core/scoring";

interface KeyDef {
  key: SortKey;
  label: string;
}

const KEYS: KeyDef[] = [
  { key: "capital", label: "Capital" },
  { key: "prob", label: "Prob" },
  { key: "return", label: "Return" },
  { key: "risk", label: "Risk" },
  { key: "edge", label: "Edge" },
];

export interface SortBarProps {
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
}

export function SortBar({ sortKey, setSortKey }: SortBarProps): JSX.Element {
  return (
    <div className="sortbar" role="tablist" aria-label="Sort recommendations">
      {KEYS.map((k, i) => (
        <span key={k.key} style={{ display: "contents" }}>
          {i > 0 && (
            <span className="sortbar-dot" aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={k.key === sortKey}
            className={
              "sortbar-key" + (k.key === sortKey ? " is-active" : "")
            }
            onClick={() => setSortKey(k.key)}
          >
            {k.label}
          </button>
        </span>
      ))}
    </div>
  );
}

export default SortBar;
