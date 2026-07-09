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
