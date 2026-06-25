// App shell -- the staged-state machine (design doc 12.4 / 8.1).
//
//   landing -> predict -> reveal -> browse
//
// App owns the cross-cutting view state (stage, mode, ghost, theme, symbol) and
// the loaded bundle (nullable until landing completes). It deliberately does NOT
// call useEngine: the hot loop runs inside <StageView>, which only mounts once a
// real bundle exists -- this keeps every hook call unconditional (no conditional
// useEngine). App handles landing/loading; the graph + rail live in StageView.

import { useEffect, useState } from "react";
import "./styles/app.css";
import type { ScoringBundle } from "./types/contracts";
import { loadBundle } from "./data/loadBundle";
import Landing from "./app/Landing";
import StageView, { type Stage } from "./app/Stage";

type View = "landing" | Stage; // "landing" | "predict" | "reveal" | "browse"
type Theme = "dark" | "light";

export function App() {
  const [view, setView] = useState<View>("landing");
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<ScoringBundle | null>(null);

  // cross-cutting view state threaded into the canvas/rail children
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [showGhost, setShowGhost] = useState(true);
  const [theme, setThemeState] = useState<Theme>("dark");

  // Theme toggle flips the documentElement dataset; unset === dark (tokens).
  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
  };

  // Landing -> predict: load the bundle (the mock for now, D18 swap point).
  const handleSubmit = async (symbol: string) => {
    setLoading(true);
    try {
      const loaded = await loadBundle(symbol);
      setBundle(loaded);
      setView("predict");
    } finally {
      setLoading(false);
    }
  };

  // predict -> reveal: the cloud stays put; the rail slides in. Then settle into
  // browse shortly after, once the slide-in has played (design doc 12.4).
  const handleConfirm = () => setView("reveal");

  useEffect(() => {
    if (view !== "reveal") return;
    const t = window.setTimeout(() => setView("browse"), 650);
    return () => window.clearTimeout(t);
  }, [view]);

  if (view === "landing" || bundle === null) {
    return <Landing loading={loading} onSubmit={handleSubmit} />;
  }

  return (
    <StageView
      bundle={bundle}
      stage={view}
      onConfirm={handleConfirm}
      mode={mode}
      setMode={setMode}
      showGhost={showGhost}
      setShowGhost={setShowGhost}
      theme={theme}
      setTheme={setTheme}
    />
  );
}

export default App;
