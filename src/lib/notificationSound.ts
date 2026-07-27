// Synthesizes a short two-note "ting" via the Web Audio API — no external
// audio file needed (there was none in this project, so `new Audio(...)`
// against a missing /notification.mp3 silently failed every time).
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

// Browsers only let audio actually play after a real user gesture (click,
// keydown, etc.) — a realtime notification arriving on its own doesn't count.
// Call this once from a click handler as early as possible (NotificationBell
// does this on mount) so the context is already unlocked and running by the
// time a notification tries to play a sound with no gesture of its own.
export function unlockNotificationAudio() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

// Android Chrome doesn't allow `new Notification(...)` from a regular page
// at all — it throws "Illegal constructor; use ServiceWorkerRegistration.
// showNotification() instead." Every call site here runs inside a state
// updater triggered by an order-status change, so that throw doesn't stay
// contained — it crashes the whole page (this is what was showing
// "Something went wrong" the instant a tracked order's status changed on
// Android, fixed by reloading only because the reload's fresh fetch never
// re-runs this code path). Routing through the service worker works on
// every platform that has one registered; the plain constructor is only a
// fallback for browsers with no service worker at all. Wrapped in
// try/catch regardless — an alert failing should never be able to take
// the page down with it.
export async function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // Best-effort alert — never worth crashing over.
  }
}

export async function playNotificationSound() {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [880, 1318.5]; // A5 then E6 — a quick bell-like "ting"
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio unavailable (unsupported browser, autoplay restrictions) — ignore
  }
}
