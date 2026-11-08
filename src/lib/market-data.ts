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
const REQUEST_TIMEOUT_MS = 2500;
const MAX_SOURCE_DEVIATION = 0.01;
const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  XRPUSDT: "ripple",
  DOGEUSDT: "dogecoin",
  ADAUSDT: "cardano",
  AVAXUSDT: "avalanche-2",
  LINKUSDT: "chainlink",
  TONUSDT: "the-open-network",
};

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

/**
 * Combines independent source responses without trusting the first response
 * that arrives. A disagreement above 1% fails closed because the value is
 * used for opening positions and automatic liquidation.
 */
export function consensusPrices(
  symbols: string[],
  sourceMaps: Array<Record<string, number> | null>,
): Record<string, number> | null {
  const usable = sourceMaps.filter((source): source is Record<string, number> => source !== null);
  if (!usable.length) return null;

  const result: Record<string, number> = {};
  for (const symbol of symbols) {
    const values = usable
      .map((source) => source[symbol])
      .filter(
        (price): price is number => price !== undefined && Number.isFinite(price) && price > 0,
      )
      .sort((a, b) => a - b);
    if (!values.length || values.length !== usable.length) return null;

    const middle = Math.floor(values.length / 2);
    const upper = values[middle];
    const lower = values[middle - 1];
    if (upper === undefined) return null;
    let median = upper;
    if (values.length % 2 === 0) {
      if (lower === undefined) return null;
      median = (lower + upper) / 2;
    }
    const maxDeviation = Math.max(...values.map((price) => Math.abs(price - median) / median));
    if (maxDeviation > MAX_SOURCE_DEVIATION) return null;
    result[symbol] = median;
  }
  return result;
}

async function getCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
  const pairs = symbols
    .map((symbol) => [symbol, COINGECKO_IDS[symbol]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  if (pairs.length !== symbols.length) return {};

  const ids = encodeURIComponent(pairs.map(([, id]) => id).join(","));
  try {
    const raw = (await requestJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    )) as Record<string, { usd?: number }>;
    const prices = Object.fromEntries(
      pairs
        .map(([symbol, id]) => [symbol, Number(raw[id]?.usd)] as const)
        .filter(([, price]) => Number.isFinite(price) && price > 0),
    );
    return symbols.every((symbol) => prices[symbol]) ? prices : {};
  } catch {
    return {};
  }
}

export async function getBinancePrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const uniqueSymbols = [...new Set(symbols)];

  const bases = [...SPOT_BASES, FUTURES_BASE];
  const batchResults = await Promise.all(
    bases.map((base) => getPricesFromSource(uniqueSymbols, base)),
  );
  const batchPrices = consensusPrices(uniqueSymbols, batchResults);
  if (batchPrices) return batchPrices;

  // Se a consulta em lote falhar, tenta todos os endpoints individuais ao mesmo tempo.
  const prices: Record<string, number> = {};
  await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      const encoded = encodeURIComponent(symbol);
      const attempts = bases.map(async (base) => {
        const parsed = asPriceMap(await requestJson(`${base}/ticker/price?symbol=${encoded}`));
        if (!parsed[symbol]) throw new Error("Preço inválido");
        return { [symbol]: parsed[symbol] };
      });
      const responses = await Promise.allSettled(attempts);
      const sourceMaps = responses.map((response) =>
        response.status === "fulfilled" ? response.value : null,
      );
      const consensus = consensusPrices([symbol], sourceMaps);
      if (consensus?.[symbol] !== undefined) prices[symbol] = consensus[symbol];
    }),
  );

  if (uniqueSymbols.every((symbol) => prices[symbol])) return prices;
  // Do not use an aggregate fallback for execution-critical prices. It may be
  // cached, use a different market, or have a different timestamp. The UI
  // ticker may still use CoinGecko for display, but opening/liquidation must
  // fail closed when Binance sources cannot reach consensus.
  throw new Error(
    "Não foi possível validar o preço agora. As fontes de execução estão indisponíveis ou divergentes. Tente novamente em alguns segundos.",
  );
}

export async function getBinanceTickers(symbols: string[]): Promise<Record<string, BinanceTicker>> {
  if (!symbols.length) return {};
  const uniqueSymbols = [...new Set(symbols)];
  const encodedSymbols = encodeURIComponent(JSON.stringify(uniqueSymbols));

  const tickerResults = await Promise.all(
    [...SPOT_BASES, FUTURES_BASE].map(async (base) => {
      try {
        const tickers = asTickerMap(
          await requestJson(`${base}/ticker/24hr?symbols=${encodedSymbols}`),
        );
        return uniqueSymbols.every((symbol) => tickers[symbol]) ? tickers : null;
      } catch {
        return null;
      }
    }),
  );
  const tickers = tickerResults.find((result) => result !== null);
  if (tickers) return tickers;

  const fallbackPrices = await getCoinGeckoPrices(uniqueSymbols);
  return Object.fromEntries(
    uniqueSymbols
      .filter((symbol) => fallbackPrices[symbol])
      .map((symbol) => {
        const price = fallbackPrices[symbol];
        return [
          symbol,
          {
            symbol,
            lastPrice: String(price),
            priceChangePercent: "0",
            highPrice: String(price),
            lowPrice: String(price),
            quoteVolume: "0",
          },
        ];
      }),
  );
}
