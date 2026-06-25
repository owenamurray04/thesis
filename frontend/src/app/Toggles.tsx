// Floating quiet affordances -- top-right cluster (design doc 12.6). Minimal
// tracked-eyebrow text toggles, translucent over the canvas, no heavy buttons:
// a 2D<->3D toggle, a ghost-paths toggle, and a light/dark theme toggle.

export interface TogglesProps {
  mode: "2d" | "3d";
  setMode: (m: "2d" | "3d") => void;
  showGhost: boolean;
  setShowGhost: (v: boolean) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}

export function Toggles({
  mode,
  setMode,
  showGhost,
  setShowGhost,
  theme,
  setTheme,
}: TogglesProps) {
  return (
    <div className="app-chrome app-toggles">
      <button
        type="button"
        className="app-toggle"
        data-active={mode === "3d"}
        aria-pressed={mode === "3d"}
        onClick={() => setMode(mode === "2d" ? "3d" : "2d")}
      >
        {mode === "2d" ? "2D" : "3D"}
      </button>
      <button
        type="button"
        className="app-toggle"
        data-active={showGhost}
        aria-pressed={showGhost}
        onClick={() => setShowGhost(!showGhost)}
      >
        Ghost
      </button>
      <button
        type="button"
        className="app-toggle"
        data-active={theme === "light"}
        aria-pressed={theme === "light"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  );
}

export default Toggles;
