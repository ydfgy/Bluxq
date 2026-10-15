export type BinancePrice = { symbol: string; price: string };

export type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
};

const SPOT_BASES = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3",
  "https://api1.binance.com/api/v3",
  "https://api2.binance.com/api/v3",
  "https://api3.binance.com/api/v3",
];

const FUTURES_BASE = "https://fapi.binance.com/fapi/v1";
const REQUEST_TIMEOUT_MS = 6000;

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Binance respondeu ${response.status}`);
  return response.json();
}

function asPriceMap(value: unknown): Record<string, number> {
  const rows = (Array.isArray(value) ? value : [value]) as BinancePrice[];
  return Object.fromEntries(
    rows
      .map((row) => [row.symbol, Number(row.price)] as const)
      .filter(([symbol, price]) => Boolean(symbol) && Number.isFinite(price) && price > 0),
  );
}

function asTickerMap(value: unknown): Record<string, BinanceTicker> {
  const rows = (Array.isArray(value) ? value : [value]) as BinanceTicker[];
  return Object.fromEntries(
    rows.filter((row) => row?.symbol && Number(row.lastPrice) > 0).map((row) => [row.symbol, row]),
  );
}

async function getPricesFromSource(symbols: string[], base: string) {
  const encodedSymbols = encodeURIComponent(JSON.stringify(symbols));
  try {
    const prices = asPriceMap(await requestJson(`${base}/ticker/price?symbols=${encodedSymbols}`));
    if (symbols.every((symbol) => prices[symbol])) return prices;
  } catch {
    // Tenta a próxima fonte; 403 e indisponibilidade temporária são esperados em alguns IPs.
  }
  return null;
}

export async function getBinancePrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const uniqueSymbols = [...new Set(symbols)];

  for (const base of [...SPOT_BASES, FUTURES_BASE]) {
    const prices = await getPricesFromSource(uniqueSymbols, base);
    if (prices) return prices;
  }

  // Se um endpoint em lote for bloqueado, tenta cada par individualmente em paralelo.
  const prices: Record<string, number> = {};
  await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      const encoded = encodeURIComponent(symbol);
      for (const base of [...SPOT_BASES, FUTURES_BASE]) {
        try {
          const parsed = asPriceMap(await requestJson(`${base}/ticker/price?symbol=${encoded}`));
          if (parsed[symbol]) {
            prices[symbol] = parsed[symbol];
            return;
          }
        } catch {
          // Continua para o próximo endpoint.
        }
      }
    }),
  );

  if (uniqueSymbols.every((symbol) => prices[symbol])) return prices;
  throw new Error(
    "Não foi possível obter o preço agora. A Binance bloqueou temporariamente as fontes públicas (403). Tente novamente em alguns segundos.",
  );
}

export async function getBinanceTickers(symbols: string[]): Promise<Record<string, BinanceTicker>> {
  if (!symbols.length) return {};
  const uniqueSymbols = [...new Set(symbols)];
  const encodedSymbols = encodeURIComponent(JSON.stringify(uniqueSymbols));

  for (const base of [...SPOT_BASES, FUTURES_BASE]) {
    try {
      const tickers = asTickerMap(
        await requestJson(`${base}/ticker/24hr?symbols=${encodedSymbols}`),
      );
      if (uniqueSymbols.every((symbol) => tickers[symbol])) return tickers;
    } catch {
      // Continua para o próximo endpoint.
    }
  }

  return {};
}
