import { ArrowUpRight, Hand, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { CandlestickData, IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";

export type Line = { price: number; color: string; title: string };
type Point = { x: number; y: number };
type Annotation = { kind: "freehand" | "line"; points: Point[] };
type ChartTool = "pan" | Annotation["kind"];

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
  const drawingRef = useRef<Annotation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tool, setTool] = useState<ChartTool>("pan");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [saved, setSaved] = useState(false);
  cb.current = onPrice;

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(annotationKey(symbol, interval)) ?? "[]",
      ) as unknown;
      setAnnotations(Array.isArray(stored) ? (stored as Annotation[]) : []);
    } catch {
      setAnnotations([]);
    }
    setSaved(false);
  }, [symbol, interval]);

  useEffect(() => {
    try {
      localStorage.setItem(annotationKey(symbol, interval), JSON.stringify(annotations));
      if (annotations.length > 0) {
        setSaved(true);
        const timer = window.setTimeout(() => setSaved(false), 1200);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Mantém as marcações na memória se o navegador bloquear o armazenamento local.
    }
    return undefined;
  }, [annotations, symbol, interval]);

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
    const rawX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const rawY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return { x: rawX, y: rawY };
  }

  function startDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === "pan") return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (!point) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Alguns navegadores não permitem captura em camadas SVG durante o primeiro toque.
    }
    const kind = tool as Annotation["kind"];
    const annotation: Annotation = { kind, points: [point, point] };
    drawingRef.current = annotation;
    setAnnotations((current) => [...current, annotation]);
  }

  function moveDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (!point) return;
    const current = drawingRef.current;
    const points =
      current.kind === "freehand" ? [...current.points, point] : [current.points[0]!, point];
    drawingRef.current = { ...current, points };
    setAnnotations((items) => [...items.slice(0, -1), drawingRef.current!]);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    drawingRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A captura pode já ter sido liberada pelo navegador.
    }
  }

  function saveAnnotations() {
    localStorage.setItem(annotationKey(symbol, interval), JSON.stringify(annotations));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function clearAnnotations() {
    setAnnotations([]);
    localStorage.removeItem(annotationKey(symbol, interval));
    setSaved(false);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <div className="pointer-events-auto absolute left-1 top-2 z-30 flex max-h-[calc(100%-1rem)] w-9 flex-col items-center gap-0.5 overflow-y-auto rounded-lg border border-white/15 bg-black/85 p-1 backdrop-blur">
        <ToolButton
          active={tool === "pan"}
          label="Navegar e arrastar o gráfico"
          onClick={() => setTool("pan")}
        >
          <Hand className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={tool === "freehand"}
          label="Lápis / desenho livre"
          onClick={() => setTool("freehand")}
        >
          <Pencil className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={tool === "line"}
          label="Linha de tendência"
          onClick={() => setTool("line")}
        >
          <ArrowUpRight className="h-4 w-4" />
        </ToolButton>
        <ToolDivider />
        <ToolButton
          label="Desfazer última marcação"
          onClick={() => setAnnotations((current) => current.slice(0, -1))}
        >
          <RotateCcw className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Limpar marcações" onClick={clearAnnotations}>
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Salvar marcações" onClick={saveAnnotations}>
          <Save className={`h-4 w-4 ${saved ? "text-bull" : ""}`} />
        </ToolButton>
        <span className="py-0.5 text-[8px] text-muted-foreground">{annotations.length}</span>
      </div>
      <div
        ref={drawingEl}
        className={`absolute inset-0 touch-none select-none ${tool !== "pan" ? "z-20 pointer-events-auto cursor-crosshair" : "pointer-events-none z-0"}`}
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        aria-label="Camada de anotações do gráfico"
      >
        <svg
          className="h-full w-full overflow-visible"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          {annotations.map((annotation, index) => (
            <polyline
              key={index}
              points={annotation.points
                .map((point) => `${point.x * 1000},${point.y * 1000}`)
                .join(" ")}
              fill="none"
              stroke="#facc15"
              strokeWidth="3"
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
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1.5 transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function ToolDivider() {
  return <span className="my-0.5 h-px w-6 bg-white/15" aria-hidden="true" />;
}
