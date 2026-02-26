const ONE_SECOND_MS = 1000;
const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 3600;

export function toDurationSeconds(startAt, endAt) {
  const deltaMs = Math.max(0, endAt - startAt);
  return Math.round(deltaMs / ONE_SECOND_MS);
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);

  if (safeSeconds < ONE_MINUTE_SECONDS) {
    return `${safeSeconds}s`;
  }

  const hours = Math.floor(safeSeconds / ONE_HOUR_SECONDS);
  const minutes = Math.floor((safeSeconds % ONE_HOUR_SECONDS) / ONE_MINUTE_SECONDS);
  const seconds = safeSeconds % ONE_MINUTE_SECONDS;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0 && seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

export function formatTimestamp(timestampMs) {
  const date = new Date(timestampMs);
  return date.toLocaleString();
}
