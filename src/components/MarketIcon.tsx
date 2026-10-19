type MarketIconProps = {
  base: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-10 w-10 text-[11px]",
  lg: "h-14 w-14 text-sm",
} as const;

const colors: Record<string, string> = {
  ADA: "from-blue-500/30 to-blue-900/60",
  AVAX: "from-red-500/30 to-red-900/60",
  BNB: "from-yellow-500/30 to-yellow-900/60",
  BTC: "from-orange-500/30 to-orange-900/60",
  DOGE: "from-amber-500/30 to-amber-900/60",
  ETH: "from-indigo-500/30 to-indigo-900/60",
  LINK: "from-sky-500/30 to-sky-900/60",
  SOL: "from-violet-500/30 to-violet-900/60",
  TON: "from-cyan-500/30 to-cyan-900/60",
  XRP: "from-slate-400/30 to-slate-800/60",
};

export function MarketIcon({ base, size = "md" }: MarketIconProps) {
  const normalized = base.replace(/USDT$/i, "").toUpperCase();
  const dimension = sizes[size];
  return (
    <span
      className={`grid ${dimension} shrink-0 place-items-center rounded-full bg-gradient-to-br ${colors[normalized] ?? "from-primary/30 to-primary/70"} font-mono font-bold text-foreground shadow-inner`}
      aria-label={`${normalized} icon`}
      role="img"
    >
      {normalized.slice(0, 3)}
    </span>
  );
}
