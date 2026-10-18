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

    const clearBlackout = () => {
      if (blackoutTimer !== undefined) window.clearTimeout(blackoutTimer);
      blackoutTimer = undefined;
      document.documentElement.removeAttribute(BLACKOUT_ATTRIBUTE);
    };

    const blackoutFor = (duration: number) => {
      document.documentElement.setAttribute(BLACKOUT_ATTRIBUTE, BLACKOUT_VALUE);
      if (blackoutTimer !== undefined) window.clearTimeout(blackoutTimer);
      blackoutTimer = window.setTimeout(clearBlackout, duration);
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
        else blackoutFor(30 * 60 * 1000);
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

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      clearBlackout();
    };
  }, []);

  return <div className="capture-blackout" aria-hidden="true" />;
}
