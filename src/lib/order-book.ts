export type OrderBookLevel = {
  price: number;
  quantity: number;
  total: number;
};

export type OrderBook = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  updatedAt: number;
};

type RawOrderBook = {
  asks?: [string, string][];
  bids?: [string, string][];
};

const BASES = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3",
  "https://api1.binance.com/api/v3",
  "https://fapi.binance.com/fapi/v1",
];

function levels(rows: [string, string][] = []): OrderBookLevel[] {
  return rows
    .map(([price, quantity]) => {
      const p = Number(price);
      const q = Number(quantity);
      return { price: p, quantity: q, total: p * q };
    })
    .filter(
      (row) =>
        Number.isFinite(row.price) &&
        row.price > 0 &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0,
    );
}

export function parseOrderBook(raw: RawOrderBook): OrderBook {
  return { asks: levels(raw.asks), bids: levels(raw.bids), updatedAt: Date.now() };
}

export async function fetchOrderBook(symbol: string, limit = 15): Promise<OrderBook> {
  const encoded = encodeURIComponent(symbol);
  const attempts = BASES.map(async (base) => {
    const response = await fetch(`${base}/depth?symbol=${encoded}&limit=${limit}`, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Livro de ordens respondeu ${response.status}`);
    const book = parseOrderBook((await response.json()) as RawOrderBook);
    if (!book.asks.length || !book.bids.length) throw new Error("Livro de ordens vazio");
    return book;
  });
  return Promise.any(attempts);
}

export function connectOrderBookStream(
  symbol: string,
  onBook: (book: OrderBook) => void,
  onError: () => void,
): WebSocket {
  const socket = new WebSocket(
    `wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@depth${10}@100ms`,
  );
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as RawOrderBook;
      const book = parseOrderBook(data);
      if (book.asks.length && book.bids.length) onBook(book);
    } catch {
      onError();
    }
  };
  socket.onerror = onError;
  return socket;
}
