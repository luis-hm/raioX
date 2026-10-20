import type { HTMLAttributes } from "react";

export type ChipTone = "neutral" | "b1" | "b2" | "p" | "chat" | "email" | "transf" | "stream" | "voip" | "ok" | "warn" | "bad";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

export function Chip({ tone = "neutral", className = "", ...props }: ChipProps) {
  return <span className={`ui-chip ui-chip--${tone} ${className}`.trim()} {...props} />;
}
