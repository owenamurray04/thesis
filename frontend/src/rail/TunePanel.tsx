// Tune panel (design doc 12.5 / 12.6 progressive disclosure). Collapsed by
// default to a single quiet "Tune" control. Opening slides up a sheet with a
// risk-appetite dial (conservative <-> aggressive); behind an "Advanced" reveal,
// three weight sliders (PoP / ROI / EV). Sentence case, sans labels, mono values.

import { useState } from "react";
import type { Weights } from "../core/scoring";
import { Num } from "../ui/Num";

export interface TunePanelProps {
  riskAppetite: number; // -1..1
  setRiskAppetite: (a: number) => void;
  weights: Weights;
  setWeights: (w: Weights) => void;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function appetiteWord(a: number): string {
  if (a <= -0.33) return "conservative";
  if (a >= 0.33) return "aggressive";
  return "balanced";
}

export function TunePanel({
  riskAppetite,
  setRiskAppetite,
  weights,
  setWeights,
}: TunePanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const setWeight = (k: keyof Weights, v: number) =>
    setWeights({ ...weights, [k]: clamp01(v) });

  return (
    <div className="tune">
      <button
        type="button"
        className={"tune-trigger" + (open ? " is-open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="tune-glyph" aria-hidden="true">
          {/* slider glyph -- hairline, no decoration */}
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <line x1="1" y1="4" x2="14" y2="4" stroke="currentColor" />
            <line x1="1" y1="11" x2="14" y2="11" stroke="currentColor" />
            <circle cx="10" cy="4" r="2" fill="var(--canvas)" stroke="currentColor" />
            <circle cx="5" cy="11" r="2" fill="var(--canvas)" stroke="currentColor" />
          </svg>
        </span>
        Tune
      </button>

      <div className={"tune-sheet" + (open ? "" : " is-closed")}>
        <div className="tune-sheet-inner" aria-hidden={!open}>
          {/* risk-appetite dial */}
          <div className="tune-field">
            <div className="tune-field-head">
              <span className="tune-field-label">Risk appetite</span>
              <Num className="tune-field-value">{appetiteWord(riskAppetite)}</Num>
            </div>
            <input
              className="tune-range"
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={riskAppetite}
              onChange={(e) => setRiskAppetite(Number(e.target.value))}
              aria-label="Risk appetite, conservative to aggressive"
            />
            <div className="tune-axis">
              <span>conservative</span>
              <span>aggressive</span>
            </div>
          </div>

          <button
            type="button"
            className="tune-reveal"
            onClick={() => setAdvanced((a) => !a)}
            aria-expanded={advanced}
          >
            {advanced ? "Hide advanced" : "Advanced"}
          </button>

          {advanced && (
            <div className="tune-advanced">
              <WeightSlider
                label="PoP"
                value={weights.wPop}
                onChange={(v) => setWeight("wPop", v)}
              />
              <WeightSlider
                label="ROI"
                value={weights.wRoi}
                onChange={(v) => setWeight("wRoi", v)}
              />
              <WeightSlider
                label="EV"
                value={weights.wEv}
                onChange={(v) => setWeight("wEv", v)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="tune-field">
      <div className="tune-field-head">
        <span className="tune-field-label">{label}</span>
        <Num className="tune-field-value">{value.toFixed(2)}</Num>
      </div>
      <input
        className="tune-range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} weight`}
      />
    </div>
  );
}

export default TunePanel;
