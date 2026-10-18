import { useEffect } from "react";

const SCREENSHOT_KEYS = new Set(["PrintScreen", "Snapshot"]);
const MAC_SCREENSHOT_KEYS = new Set(["3", "4", "5", "6"]);

function isCaptureShortcut(event: KeyboardEvent): boolean {
  if (SCREENSHOT_KEYS.has(event.key)) return true;

  const key = event.key.toLowerCase();
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const isMacScreenshot =
    isMac && event.metaKey && event.shiftKey && MAC_SCREENSHOT_KEYS.has(event.key);
  const isWindowsSnip = event.metaKey && event.shiftKey && key === "s";
  const isLinuxCapture = event.ctrlKey && event.shiftKey && key === "s";

  return isMacScreenshot || isWindowsSnip || isLinuxCapture;
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCaptureShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!SCREENSHOT_KEYS.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  return null;
}
