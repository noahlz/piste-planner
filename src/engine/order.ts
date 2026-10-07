/**
 * Orders two ids by code point, with no locale. `localeCompare` follows the
 * runtime's locale (Lithuanian puts "Y" between "I" and "J"), so a sender and
 * a receiver in different locales would break a tie between two events
 * differently and replay a shared link to different boards (017 P7). Over
 * every catalogue id this order equals the `en` locale's, so the scheduler's
 * existing tie-breaks keep their order.
 *
 * The walk compares code points, not UTF-16 units, so an astral character
 * sorts above every basic-plane one. It ends within the shorter string's length.
 */
export function compareIds(a: string, b: string): number {
  const shorter = Math.min(a.length, b.length)
  for (let i = 0; i < shorter; ) {
    const ca = a.codePointAt(i)!
    const cb = b.codePointAt(i)!
    if (ca !== cb) return ca < cb ? -1 : 1
    // Equal code points have equal width, so one step serves both strings.
    i += ca > 0xffff ? 2 : 1
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1
}
