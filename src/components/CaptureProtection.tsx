import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const SCREENSHOT_KEYS = new Set(["PrintScreen", "Snapshot"]);
const MAC_SCREENSHOT_KEYS = new Set(["3", "4"]);
const CAPTURE_TOOL_NAMES = ["obs", "loom", "xsplit", "streamlabs", "bandicam", "camtasia"];
const BLACKOUT_ATTRIBUTE = "data-capture-shield";
const BLACKOUT_VALUE = "black";

function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function isScreenshotShortcut(event: KeyboardEvent): boolean {
  if (SCREENSHOT_KEYS.has(event.key)) return true;

  const key = event.key.toLowerCase();
  if (isMac()) return event.metaKey && event.shiftKey && MAC_SCREENSHOT_KEYS.has(event.key);
  return event.metaKey && event.shiftKey && key === "s";
}

function isRecordingShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  if (isMac()) return event.metaKey && event.shiftKey && key === "5";
  return event.metaKey && event.altKey && key === "r";
}

function blockDisplayCaptureApi() {
  const mediaDevices = navigator.mediaDevices as
    (MediaDevices & { getDisplayMedia?: MediaDevices["getDisplayMedia"] }) | undefined;
  if (!mediaDevices?.getDisplayMedia) return;

  const rejectCapture = async () => {
    throw new DOMException("Screen capture is disabled.", "NotAllowedError");
  };

  try {
    mediaDevices.getDisplayMedia = rejectCapture;
  } catch {
    // Alguns navegadores protegem a propriedade; a Permissions-Policy do servidor
    // continua bloqueando display capture independentemente desta barreira.
  }
}

function CaptureNoise() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const render = () => {
      const width = Math.max(1, Math.ceil(window.innerWidth / 4));
      const height = Math.max(1, Math.ceil(window.innerHeight / 4));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const image = context.createImageData(width, height);
      for (let index = 0; index < image.data.length; index += 4) {
        if (Math.random() > 0.35) continue;
        const value = Math.random() > 0.5 ? 255 : 0;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 42;
      }
      context.putImageData(image, 0, 0);
    };

    render();
    const timer = window.setInterval(render, 140);
    window.addEventListener("resize", render);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", render);
    };
  }, []);

  return <canvas ref={canvasRef} className="capture-noise" aria-hidden="true" />;
}

export function CaptureProtection() {
  const { session } = useAuth();
  const [watermarkTime, setWatermarkTime] = useState(() => new Date().toISOString());
  const [captureToolDetected, setCaptureToolDetected] = useState(false);

  useEffect(() => {
    blockDisplayCaptureApi();

    let blackoutTimer: number | undefined;
    let persistentBlackout = false;

    const clearBlackout = () => {
      if (blackoutTimer !== undefined) window.clearTimeout(blackoutTimer);
      blackoutTimer = undefined;
      persistentBlackout = false;
      document.documentElement.removeAttribute(BLACKOUT_ATTRIBUTE);
    };

    const blackoutFor = (duration: number, persistent = false) => {
      persistentBlackout = persistent;
      document.documentElement.setAttribute(BLACKOUT_ATTRIBUTE, BLACKOUT_VALUE);
      if (blackoutTimer !== undefined) window.clearTimeout(blackoutTimer);
      if (!persistent) blackoutTimer = window.setTimeout(clearBlackout, duration);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearBlackout();
        return;
      }

      if (isRecordingShortcut(event)) {
        const isAlreadyBlack =
          document.documentElement.getAttribute(BLACKOUT_ATTRIBUTE) === BLACKOUT_VALUE;
        if (isAlreadyBlack) clearBlackout();
        else blackoutFor(30 * 60 * 1000, true);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (!isScreenshotShortcut(event)) return;
      blackoutFor(4000);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onBlur = () =>
      blackoutFor(persistentBlackout ? 30 * 60 * 1000 : 1500, persistentBlackout);
    const onFocus = () => {
      if (!persistentBlackout) window.setTimeout(clearBlackout, 250);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        blackoutFor(persistentBlackout ? 30 * 60 * 1000 : 1500, persistentBlackout);
      } else onFocus();
    };
    const onBeforePrint = () => blackoutFor(60 * 1000);
    const onAfterPrint = () => clearBlackout();

    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      clearBlackout();
    };
  }, []);

  useEffect(() => {
    const updateWatermark = () => setWatermarkTime(new Date().toISOString());
    const timer = window.setInterval(updateWatermark, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const detectCaptureTools = async () => {
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices();
        const labels = (devices ?? []).map((device) => device.label.toLowerCase());
        const detected = labels.some((label) =>
          CAPTURE_TOOL_NAMES.some((name) => label.includes(name)),
        );
        setCaptureToolDetected(detected);
        document.documentElement.toggleAttribute("data-capture-tool", detected);
      } catch {
        // Os labels podem ficar vazios sem permissão de mídia; nesse caso não há
        // como identificar software externo pelo navegador.
      }
    };

    void detectCaptureTools();
    const timer = window.setInterval(detectCaptureTools, 15_000);
    navigator.mediaDevices?.addEventListener("devicechange", detectCaptureTools);
    return () => {
      window.clearInterval(timer);
      navigator.mediaDevices?.removeEventListener("devicechange", detectCaptureTools);
      document.documentElement.removeAttribute("data-capture-tool");
    };
  }, []);

  const userId = session?.user.id;
  const watermark = userId ? `BLUXQ • ${userId} • ${watermarkTime}` : `BLUXQ • ${watermarkTime}`;

  return (
    <>
      <div className="capture-blackout" aria-hidden="true" />
      <CaptureNoise />
      <div className="capture-watermark" aria-hidden="true">
        <span>{watermark}</span>
        <span>{watermark}</span>
        <span>{watermark}</span>
      </div>
      <p className="capture-legal-notice" aria-hidden="true">
        {captureToolDetected
          ? "Ferramenta de captura detectada. O acesso visual foi restringido."
          : "Uso, reprodução ou captura não autorizada podem violar os Termos da plataforma."}
      </p>
    </>
  );
}
