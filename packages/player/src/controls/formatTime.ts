const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TWO_DIGITS = 2;

/**
 * `m:ss`, or `h:mm:ss` from one hour on, as media players show it. Negative or unknown times
 * read as zero.
 */
export function formatTime(totalSeconds: number): string {
  const whole = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const seconds = whole % SECONDS_PER_MINUTE;
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const hours = Math.floor(whole / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${minutes}:${padded(seconds)}`;
}

function padded(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}
