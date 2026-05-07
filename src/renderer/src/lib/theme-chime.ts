/** UI click feedback (Web Audio). One shared context; scheme tints the pitch slightly. */

export type ChimeColorScheme =
  | 'default'
  | 'violet'
  | 'teal'
  | 'sunset'
  | 'wii'
  | 'ps3'
  | 'xbox360'
  | 'cube'
  | 'wiiu'
  | '3ds'
  | 'bee'

const SCHEME_FREQ: Record<ChimeColorScheme, number> = {
  default: 392,
  violet: 523.25,
  teal: 293.66,
  sunset: 659.25,
  wii: 440,
  /** PS3 XMB “tick” sits a bit lower than generic UI chimes */
  ps3: 349.23,
  /** Xbox 360 dashboard chime family — slightly warmer than PS3 */
  xbox360: 329.63,
  cube: 311.13,
  wiiu: 493.88,
  '3ds': 277.18,
  /** ~B4 — short bright hive tick */
  bee: 493.88
}

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedCtx) sharedCtx = new Ctor()
  void sharedCtx.resume().catch(() => {})
  return sharedCtx
}

/** Short tick for any primary-button-like control (pointerdown, main button only). */
export function playUiButtonChime(scheme: ChimeColorScheme): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const base = SCHEME_FREQ[scheme] ?? 440
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    const f0 = base * 2.35
    const f1 = base * 1.85
    osc.frequency.setValueAtTime(f0, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + 0.032)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.042, ctx.currentTime + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.048)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.055)
  } catch {
    /* blocked / suspended */
  }
}
