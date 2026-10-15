export const MARKETS = [
  { symbol: "BTCUSDT", base: "BTC", name: "Bitcoin", icon: "btc" },
  { symbol: "ETHUSDT", base: "ETH", name: "Ethereum", icon: "eth" },
  { symbol: "SOLUSDT", base: "SOL", name: "Solana", icon: "sol" },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", icon: "bnb" },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", icon: "xrp" },
  { symbol: "DOGEUSDT", base: "DOGE", name: "Dogecoin", icon: "doge" },
  { symbol: "ADAUSDT", base: "ADA", name: "Cardano", icon: "ada" },
  { symbol: "AVAXUSDT", base: "AVAX", name: "Avalanche", icon: "avax" },
  { symbol: "LINKUSDT", base: "LINK", name: "Chainlink", icon: "link" },
  { symbol: "TONUSDT", base: "TON", name: "Toncoin", icon: "ton" },
] as const;

export const SYMBOLS = MARKETS.map((m) => m.symbol) as string[];

/** Link do grupo Roblox onde os usuários fazem o depósito. Troque pelo seu. */
export const ROBLOX_GROUP_URL = "https://www.roblox.com/communities/0/seu-grupo";

export const FEE_RATE = 0.1; // 10% sobre o lucro
export const STAKER_SHARE = 0.7; // 70% da taxa vai para quem faz stake
export const PROFIT_CAP = 5; // lucro máximo = 5x a margem (reservado na pool)
export const LIQ_LOSS = 0.9; // liquida ao perder 90% da margem
export const MIN_LEVERAGE = 5;
export const MAX_LEVERAGE = 50;

export const fmt = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtPrice = (n: number) =>
  n >= 100 ? fmt(n, 2) : n >= 1 ? fmt(n, 4) : fmt(n, 6);

export function calcPnl(side: string, qty: number, entry: number, price: number, margin: number) {
  const raw = side === "long" ? qty * (price - entry) : qty * (entry - price);
  return Math.max(Math.min(raw, margin * PROFIT_CAP), -margin);
}
