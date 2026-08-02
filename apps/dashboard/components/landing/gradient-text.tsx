import type { ReactNode } from "react";

type GradientTextProps = {
  children: ReactNode;
  className?: string;
};

export function GradientText({ children, className = "" }: GradientTextProps) {
  return (
    <span
      className={[
        "bg-gradient-to-r from-[#12B8DE] via-[#3B82F6] to-[#7DD3FC]",
        "bg-clip-text text-transparent",
        "drop-shadow-[0_0_34px_rgba(18,184,222,0.24)]",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}