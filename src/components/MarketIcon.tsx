type MarketIconProps = {
  base: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-7 w-7 p-1",
  md: "h-10 w-10 p-1.5",
  lg: "h-14 w-14 p-2",
} as const;

/**
 * Uses the real branded coin logos vendored in public/crypto-icons.
 * The catalog icons are CC0; TON uses the official TON media asset.
 */
export function MarketIcon({ base, size = "md" }: MarketIconProps) {
  const normalized = base.replace(/USDT$/i, "").toLowerCase();
  const label = normalized.toUpperCase();
  return (
    <span
      className={`grid ${sizes[size]} shrink-0 place-items-center rounded-full bg-white/95 ring-1 ring-white/10`}
      aria-label={`${label} logo`}
      role="img"
    >
      <img
        src={`/crypto-icons/${normalized}.svg`}
        alt={`${label} logo`}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
