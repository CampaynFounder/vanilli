/**
 * Sanitize error messages for user display. Never show provider names (e.g. Kling);
 * use VANNILLI-branded fallbacks instead.
 */
export function sanitizeForUser(msg: string | null | undefined): string {
  if (msg == null || String(msg).trim() === "") return "Something went wrong. Please try again or contact VANNILLI support.";
  const s = String(msg);
  if (/kling/i.test(s)) return "Video generation failed. Please try again or contact VANNILLI support.";
  return s;
}
