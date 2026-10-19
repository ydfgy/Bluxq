import { useState } from "react";

type MarketIconProps = {
  base: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-10 w-10 text-[11px]",
  lg: "h-14 w-14 text-sm",
} as const;

export function MarketIcon({ base, size = "md" }: MarketIconProps) {
  const [broken, setBroken] = useState(false);
  const dimension = sizes[size];
  return (
    <span
      className={`grid ${dimension} shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 font-mono text-muted-foreground`}
      aria-label={`${base} icon`}
    >
      {broken ? (
        <span aria-hidden="true">{base.slice(0, 3).toUpperCase()}</span>
      ) : (
        <img
          src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base.toLowerCase()}.png`}
          alt={`${base} icon`}
          className="h-full w-full rounded-full object-contain"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
