import type React from "react";

// Every number / ticker / price in the app routes through <Num> so figures share
// the tabular-mono treatment (design doc 12). Formatting itself lives in
// lib/format.ts -- Num is a presentational passthrough only.
export function Num({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={"mono " + (className ?? "")}>{children}</span>;
}

export default Num;
