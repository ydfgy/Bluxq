import { useEffect, useRef, useState } from "react";

export type Line = { price: number; color: string; title: string };

/** O canvas do Lightweight Charts 4.x não aceita a sintaxe oklch do tema. */
function chartColor(variable: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!raw) return fallback;
  const probe = document.createElement("span");
  probe.style.color = raw;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved && !resolved.includes("oklch") && !resolved.includes("color(") ? resolved : fallback;
}

/** Gráfico de velas ao vivo (Binance), carregado só no navegador. */
export function PriceChart({ symbol, interval, lines, onPrice }: { symbol: string; interval: string; lines: Line[]; onPrice: (p: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);
  const priceLines = useRef<any[]>([]);
  const cb = useRef(onPrice);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  cb.current = onPrice;

  useEffect(() => {
    let chart: any; let ws: WebSocket | null = null; let dead = false;
    setStatus("loading");
    setError("");
    (async () => {
      try {
        const { createChart, CrosshairMode } = await import("lightweight-charts");
        if (dead || !el.current) return;
        const muted = chartColor("--muted-foreground", "#94a3a0");
        chart = createChart(el.current, {
          autoSize: true,
          layout: { background: { color: "transparent" }, textColor: muted },
          grid: { vertLines: { color: "rgba(128,128,128,0.08)" }, horzLines: { color: "rgba(128,128,128,0.08)" } },
          crosshair: { mode: CrosshairMode.Normal },
          timeScale: { timeVisible: true, secondsVisible: false },
        });
        const s = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
        seriesRef.current = s;
        const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error(`Binance respondeu ${r.status}`);
        const k = (await r.json()) as any[];
        if (dead) return;
        if (!Array.isArray(k) || !k.length) throw new Error("Nenhum candle disponível para este par");
        s.setData(k.map((x) => ({ time: Math.floor(Number(x[0]) / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4] })));
        cb.current(+k[k.length - 1][4]);
        setStatus("ready");
        ws = new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${interval}`);
        ws.onmessage = (m) => {
          if (dead) return;
          try {
            const d = JSON.parse(m.data).k;
            s.update({ time: Math.floor(Number(d.t) / 1000), open: +d.o, high: +d.h, low: +d.l, close: +d.c });
            cb.current(+d.c);
          } catch { /* ignora mensagens inválidas do stream */ }
        };
        ws.onerror = () => { if (!dead) setError("Atualização ao vivo indisponível; os candles carregados continuam visíveis."); };
      } catch (e) {
        if (!dead) { setStatus("error"); setError(e instanceof Error ? e.message : "Não foi possível carregar os dados da Binance"); }
      }
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

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      {status === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">Carregando candles da Binance…</div>}
      {status === "error" && <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">Não foi possível carregar o gráfico agora.<br />{error}</div>}
      {status === "ready" && error && <div className="pointer-events-none absolute bottom-2 left-2 text-xs text-gold">{error}</div>}
    </div>
  );
}
