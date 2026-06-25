// The belief cloud f(S) (design doc 8.2 / 8.4): a soft filled wash anchored at the
// baseline, its peak scaled to a fraction of the height. Tinted by the payoff sign
// underneath -- green family where selected.pnl > 0, red where < 0. The green-tinted
// sub-area visually *is* PoP_f (the probability of profit under the belief).

import { useMemo } from "react";
import { area, curveBasis } from "d3-shape";
import type { Geometry } from "./scales";

interface BeliefCloudProps {
  grid: number[];
  f: Float64Array;
  pnl: Float64Array;
  geom: Geometry;
}

/** Build the cloud top profile as y(px) per grid point, peak -> CLOUD_PEAK_FRAC. */
function cloudTop(f: Float64Array, geom: Geometry): number[] {
  let peak = 0;
  for (let i = 0; i < f.length; i++) if (f[i] > peak) peak = f[i];
  const inv = peak > 0 ? 1 / peak : 0;
  const out = new Array<number>(f.length);
  for (let i = 0; i < f.length; i++) {
    const h = geom.yCloudHeight(f[i] * inv);
    out[i] = geom.cloudBaseY - h;
  }
  return out;
}

export function BeliefCloud({ grid, f, pnl, geom }: BeliefCloudProps) {
  const { greenPath, redPath } = useMemo(() => {
    const top = cloudTop(f, geom);
    const n = Math.min(grid.length, f.length, pnl.length);

    type Pt = { i: number };
    const profit = (i: number) => pnl[i] > 0;

    const mkArea = (predicate: (i: number) => boolean): string => {
      // Build disjoint runs where predicate holds; each run becomes its own
      // closed area so the cloud is segmented at the payoff zero-crossings.
      const gen = area<Pt>()
        .x((d) => geom.x(grid[d.i]))
        .y0(geom.cloudBaseY)
        .y1((d) => top[d.i])
        .curve(curveBasis);
      let d = "";
      let run: Pt[] = [];
      const flush = () => {
        if (run.length > 0) d += gen(run) ?? "";
        run = [];
      };
      for (let i = 0; i < n; i++) {
        if (predicate(i)) run.push({ i });
        else flush();
      }
      flush();
      return d;
    };

    return {
      greenPath: mkArea(profit),
      redPath: mkArea((i) => !profit(i)),
    };
  }, [grid, f, pnl, geom]);

  return (
    <g className="viz-belief-cloud" aria-hidden>
      {/* red (loss) wash sits beneath; both very soft so the cloud never shouts */}
      <path d={redPath} fill="var(--r-fill)" fillOpacity={0.85} stroke="none" />
      <path d={greenPath} fill="var(--g-fill)" fillOpacity={0.9} stroke="none" />
      {/* a hairline edge along the profit run reads as the density crest */}
      <path
        d={greenPath}
        fill="none"
        stroke="var(--g-2)"
        strokeOpacity={0.16}
        strokeWidth={1}
      />
    </g>
  );
}

export default BeliefCloud;
