import type React from "react";

// Small uppercase eyebrow label (design doc 12). `as` lets callers pick the tag.
export function MicroLabel({
  children,
  className,
  as: Tag = "span",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return <Tag className={"eyebrow " + (className ?? "")}>{children}</Tag>;
}

export default MicroLabel;
