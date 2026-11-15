import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { CandlestickData, IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";
import { Eraser, Hand, Pencil, Save, Trash2 } from "lucide-react";

export type Line = { price: number; color: string; title: string };
type Point = { x: number; y: number };
type Stroke = Point[];
type ChartTool = "pan" | "pencil" | "eraser";

/** O canvas do Lightweight Charts 4.x não aceita a sintaxe oklch do tema. */
function chartColor(variable: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!raw) return fallback;
  const probe = document.createElement("span");
  probe.style.color = raw;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved && !resolved.includes("oklch") && !resolved.includes("color(")
    ? resolved
    : fallback;
}

function annotationKey(symbol: string, interval: string) {
  return `bluxq.chart-annotations.${symbol}.${interval}`;
}

/** Gráfico de velas ao vivo (Binance), com ferramentas de desenho persistentes. */
export function PriceChart({
  symbol,
  interval,
  lines,
  onPrice,
}: {
  symbol: string;
  interval: string;
  lines: Line[];
  onPrice: (p: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const drawingEl = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const cb = useRef(onPrice);
  const drawingRef = useRef<Stroke | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tool, setTool] = useState<ChartTool>("pan");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [saved, setSaved] = useState(false);
  cb.current = onPrice;

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(annotationKey(symbol, interval)) ?? "[]",
      ) as unknown;
      setStrokes(Array.isArray(stored) ? (stored as Stroke[]) : []);
    } catch {
      setStrokes([]);
    }
    setSaved(false);
  }, [symbol, interval]);

  useEffect(() => {
    try {
      localStorage.setItem(annotationKey(symbol, interval), JSON.stringify(strokes));
      if (strokes.length > 0) {
        setSaved(true);
        const timer = window.setTimeout(() => setSaved(false), 1200);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Mantém as marcações na memória se o navegador bloquear o armazenamento local.
    }
    return undefined;
  }, [strokes, symbol, interval]);

  useEffect(() => {
    let chart: IChartApi | undefined;
    let ws: WebSocket | null = null;
    let dead = false;
    setStatus("loading");
    setError("");
    (async () => {
      try {
        const { createChart, CrosshairMode } = await import("lightweight-charts");
        if (dead || !el.current) return;
        const muted = chartColor("--muted-foreground", "#94a3a0");
        chart = createChart(el.current, {
          autoSize: true,
          layout: { background: { color: "#000000" }, textColor: muted },
          grid: { vertLines: { visible: false }, horzLines: { visible: false } },
          crosshair: { mode: CrosshairMode.Normal },
          timeScale: { timeVisible: true, secondsVisible: false },
        });
        const s = chart.addCandlestickSeries({
          upColor: "#16a34a",
          downColor: "#dc2626",
          borderVisible: false,
          wickUpColor: "#16a34a",
          wickDownColor: "#dc2626",
        });
        seriesRef.current = s;
        const encodedSymbol = encodeURIComponent(symbol);
        const encodedInterval = encodeURIComponent(interval);
        const r = await fetch(
          `https://data-api.binance.vision/api/v3/klines?symbol=${encodedSymbol}&interval=${encodedInterval}&limit=500`,
          { signal: AbortSignal.timeout(12000) },
        );
        if (!r.ok) throw new Error(`Binance respondeu ${r.status}`);
        const k = (await r.json()) as unknown;
        if (!Array.isArray(k) || !k.length || !k.every(Array.isArray)) {
          throw new Error("Nenhum candle disponível para este par");
        }
        const candles: CandlestickData<Time>[] = k.map((row) => {
          const [timestamp, open, high, low, close] = row;
          const values = [timestamp, open, high, low, close].map(Number);
          const [timestampValue, openValue, highValue, lowValue, closeValue] = values;
          if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
            throw new Error("A Binance retornou um candle inválido");
          }
          return {
            time: Math.floor(timestampValue! / 1000) as Time,
            open: openValue!,
            high: highValue!,
            low: lowValue!,
            close: closeValue!,
          };
        });
        s.setData(candles);
        cb.current(candles[candles.length - 1]?.close ?? 0);
        setStatus("ready");
        ws = new WebSocket(
          `wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${interval}`,
        );
        ws.onmessage = (m) => {
          if (dead) return;
          try {
            const payload = JSON.parse(m.data) as {
              k?: { t?: number; o?: string; h?: string; l?: string; c?: string };
            };
            const d = payload.k;
            const values = [d?.t, d?.o, d?.h, d?.l, d?.c].map(Number);
            const [timestampValue, openValue, highValue, lowValue, closeValue] = values;
            if (values.some((value) => !Number.isFinite(value) || value <= 0)) return;
            s.update({
              time: Math.floor(timestampValue! / 1000) as Time,
              open: openValue!,
              high: highValue!,
              low: lowValue!,
              close: closeValue!,
            });
            cb.current(closeValue!);
          } catch {
            /* ignora mensagens inválidas do stream */
          }
        };
        ws.onerror = () => {
          if (!dead)
            setError("Atualização ao vivo indisponível; os candles carregados continuam visíveis.");
        };
      } catch (e) {
        if (!dead) {
          setStatus("error");
          setError(
            e instanceof Error ? e.message : "Não foi possível carregar os dados da Binance",
          );
        }
      }
    })();
    return () => {
      dead = true;
      ws?.close();
      chart?.remove();
      seriesRef.current = null;
      priceLines.current = [];
    };
  }, [symbol, interval]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = seriesRef.current;
      if (!s) return;
      priceLines.current.forEach((l) => s.removePriceLine(l));
      priceLines.current = lines.map((l) =>
        s.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: l.title,
        }),
      );
      clearInterval(t);
    }, 300);
    return () => clearInterval(t);
  }, [lines]);

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>): Point | null {
    const rect = drawingEl.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function startDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === "pan") return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "eraser") {
      setStrokes((current) => current.slice(0, -1));
      return;
    }
    drawingRef.current = [point];
    setStrokes((current) => [...current, [point]]);
  }

  function moveDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== "pencil" || !drawingRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = [...drawingRef.current, point];
    setStrokes((current) => [...current.slice(0, -1), drawingRef.current!]);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    drawingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function saveAnnotations() {
    localStorage.setItem(annotationKey(symbol, interval), JSON.stringify(strokes));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function clearAnnotations() {
    setStrokes([]);
    localStorage.removeItem(annotationKey(symbol, interval));
    setSaved(false);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <div className="pointer-events-auto absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 backdrop-blur">
        <ToolButton
          active={tool === "pan"}
          label="Navegar e arrastar o gráfico"
          onClick={() => setTool("pan")}
        >
          <Hand className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          active={tool === "pencil"}
          label="Desenhar no gráfico"
          onClick={() => setTool("pencil")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Apagar última marcação"
          onClick={() => setStrokes((current) => current.slice(0, -1))}
        >
          <Eraser className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Limpar marcações" onClick={clearAnnotations}>
          <Trash2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Salvar marcações" onClick={saveAnnotations}>
          <Save className={`h-3.5 w-3.5 ${saved ? "text-bull" : ""}`} />
        </ToolButton>
        <span className="px-1 text-[10px] text-muted-foreground">
          {saved ? "Salvo" : `${strokes.length} marcações`}
        </span>
      </div>
      <div
        ref={drawingEl}
        className={`absolute inset-0 ${tool === "pencil" ? "cursor-crosshair" : tool === "eraser" ? "cursor-cell" : "pointer-events-none"}`}
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        aria-label="Camada de anotações do gráfico"
      >
        <svg className="h-full w-full overflow-visible" preserveAspectRatio="none">
          {strokes.map((stroke, index) => (
            <polyline
              key={index}
              points={stroke.map((point) => `${point.x * 100}%,${point.y * 100}%`).join(" ")}
              fill="none"
              stroke="#facc15"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          Carregando candles da Binance…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          Não foi possível carregar o gráfico agora.
          <br />
          {error}
        </div>
      )}
      {status === "ready" && error && (
        <div className="pointer-events-none absolute bottom-2 left-2 text-xs text-gold">
          {error}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1.5 transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
