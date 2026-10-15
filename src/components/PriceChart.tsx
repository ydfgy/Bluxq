import { useEffect, useRef } from "react";

export type Line = { price: number; color: string; title: string };

/** Gráfico de velas ao vivo (Binance), carregado só no navegador. */
export function PriceChart({ symbol, interval, lines, onPrice }: { symbol: string; interval: string; lines: Line[]; onPrice: (p: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);
  const priceLines = useRef<any[]>([]);
  const cb = useRef(onPrice);
  cb.current = onPrice;

  useEffect(() => {
    let chart: any; let ws: WebSocket | null = null; let dead = false; 
    (async () => {
      const { createChart, CrosshairMode } = await import("lightweight-charts");
      if (dead || !el.current) return;
      const css = getComputedStyle(document.documentElement);
      const c = (v: string) => css.getPropertyValue(v).trim() || undefined;
      chart = createChart(el.current, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: c("--muted-foreground") ?? "#888" },
        grid: { vertLines: { color: "rgba(128,128,128,0.08)" }, horzLines: { color: "rgba(128,128,128,0.08)" } },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false },
      });
      const s = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
      seriesRef.current = s;
      const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`);
      const k = (await r.json()) as any[];
      if (dead) return;
      s.setData(k.map((x) => ({ time: x[0] / 1000, open: +x[1], high: +x[2], low: +x[3], close: +x[4] })));
      if (k.length) cb.current(+k[k.length - 1][4]);
      ws = new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${interval}`);
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data).k;
        s.update({ time: d.t / 1000, open: +d.o, high: +d.h, low: +d.l, close: +d.c });
        cb.current(+d.c);
      };
    })();
    return () => { dead = true; ws?.close(); chart?.remove(); seriesRef.current = null; priceLines.current = []; };
  }, [symbol, interval]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = seriesRef.current; if (!s) return;
      priceLines.current.forEach((l) => s.removePriceLine(l));
      priceLines.current = lines.map((l) => s.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title }));
      clearInterval(t);
    }, 300);
    return () => clearInterval(t);
  }, [lines]);

  return <div ref={el} className="h-full w-full" />;
}
