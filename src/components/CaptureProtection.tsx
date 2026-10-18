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
    throw new DOMException(
      "A captura de tela está desabilitada nesta plataforma.",
      "NotAllowedError",
    );
  };

  try {
    mediaDevices.getDisplayMedia = rejectCapture;
  } catch {
    // Alguns navegadores protegem a propriedade. A Permissions-Policy do servidor
    // continua sendo aplicada independentemente desta barreira de JavaScript.
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

      // Em browsers que expõem a área de transferência, evita que um PrintScreen
      // deixe uma imagem disponível para colagem. A permissão pode ser recusada.
      void navigator.clipboard?.writeText("").catch(() => undefined);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!SCREENSHOT_KEYS.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const onCut = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
    };
  }, []);

  return (
    <div className="capture-watermark" aria-hidden="true">
      <span>BLUXQ • CONTEÚDO PROTEGIDO</span>
      <span>BLUXQ • CONTEÚDO PROTEGIDO</span>
      <span>BLUXQ • CONTEÚDO PROTEGIDO</span>
      <span>BLUXQ • CONTEÚDO PROTEGIDO</span>
    </div>
  );
}
