const TRACKED_PROTOCOLS = new Set(["http:", "https:"]);

export function extractDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isTrackableUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return TRACKED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function isExcludedDomain(rawUrl, excludedDomains) {
  if (!rawUrl || !Array.isArray(excludedDomains) || excludedDomains.length === 0) {
    return false;
  }

  const hostname = extractDomain(rawUrl);
  if (!hostname) {
    return false;
  }

  return excludedDomains.some((entry) => {
    const normalized = String(entry || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

export function readableTitle(title, fallbackUrl) {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle) {
    return normalizedTitle;
  }

  return String(fallbackUrl || "Untitled page");
}
