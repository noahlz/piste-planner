/**
 * Serial-scheduler scheduled-event counts captured against integration B1–B7
 * on 2026-04-27 at commit 45b8d42f14cbd27495d5164959e37c54bac5d677.
 *
 * These are the comparison floor for the Phase C concurrent scheduler:
 * concurrent counts must be >= SERIAL_BASELINES[scenario] (strictly greater
 * for B5/B6/B7 by at least GAIN_B*).
 *
 * Re-capture if the serial scheduler's output for B1–B7 changes.
 */
export const SERIAL_BASELINES = {
  B1: 8,
  B2: 8,
  B3: 6,
  B4: 7,
  B5: 3,
  B6: 18,
  B7: 4,
} as const
