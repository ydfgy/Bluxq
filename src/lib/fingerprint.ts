/**
 * Produces a privacy-conscious browser identifier for abuse prevention.
 * Raw signals stay in the browser; only the SHA-256 digest is sent to the server.
 */
export async function getFingerprintHash(): Promise<string | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 60;
  const context = canvas.getContext("2d");
  let canvasSignal = "unavailable";
  if (context) {
    context.textBaseline = "top";
    context.font = "16px Arial";
    context.fillStyle = "#172554";
    context.fillRect(0, 0, 240, 60);
    context.fillStyle = "#f8fafc";
    context.fillText("bluxq-security", 7, 9);
    canvasSignal = canvas.toDataURL();
  }

  const signals = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? "unknown"),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "unknown"),
    canvasSignal,
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signals));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
