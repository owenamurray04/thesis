// State 0 -- Landing (design doc 12.4 / 8.1). A blank dark canvas: the wordmark
// top-left, and a centered tracked eyebrow above a large mono ticker field --
// underline only, no box, no button. Enter (or a valid non-empty symbol) loads
// the bundle and advances to `predict`. Any symbol maps to the mock for now.

import { useState } from "react";
import Wordmark from "../ui/Wordmark";
import MicroLabel from "../ui/MicroLabel";

export interface LandingProps {
  loading: boolean;
  onSubmit: (symbol: string) => void;
}

export function Landing({ loading, onSubmit }: LandingProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const symbol = value.trim().toUpperCase();
    if (symbol.length === 0 || loading) return;
    onSubmit(symbol);
  };

  return (
    <div className="app-landing">
      <div className="app-landing-mark">
        <Wordmark />
      </div>

      <div className="app-horizon" aria-hidden="true" />

      <div className="app-landing-center">
        {loading ? (
          <span className="app-loading">loading</span>
        ) : (
          <>
            <MicroLabel className="app-landing-eyebrow app-enter app-enter--1">
              Pick a ticker
            </MicroLabel>
            <input
              className="app-ticker app-enter app-enter--2"
              value={value}
              placeholder="—"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              maxLength={6}
              aria-label="Ticker symbol"
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default Landing;
