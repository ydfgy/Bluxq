import { useEffect } from "react";

const SCREENSHOT_KEYS = new Set(["PrintScreen", "Snapshot"]);
const MAC_SCREENSHOT_KEYS = new Set(["3", "4"]);
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
    // Alguns navegadores protegem a propriedade; o cabeçalho do servidor
    // continua bloqueando display capture independentemente desta barreira.
  }
}

export function CaptureProtection() {
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

  return <div className="capture-blackout" aria-hidden="true" />;
}
