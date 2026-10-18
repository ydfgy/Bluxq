/**
 * Produces privacy-conscious browser evidence for abuse prevention.
 * The normalized signals are sent only to the protected server endpoint for
 * duplicate-account analysis; no raw network or account data is collected here.
 */
export type FingerprintEvidence = {
  hash: string;
  signalData: {
    userAgent: string;
    platform: string;
    language: string;
    timezone: string;
    screen: string;
    colorDepth: number;
    hardwareConcurrency: number | null;
    deviceMemory: number | null;
    canvas: string;
  };
};

export async function getFingerprintEvidence(): Promise<FingerprintEvidence | null> {
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

  const signalData = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    canvas: canvasSignal,
  };
  const canonical = JSON.stringify(signalData);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, signalData };
}

export async function getFingerprintHash(): Promise<string | null> {
  return (await getFingerprintEvidence())?.hash ?? null;
}
