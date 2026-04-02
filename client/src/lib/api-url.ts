function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, "");
}

export function getConfiguredApiBaseUrl() {
  const rawValue =
    typeof import.meta.env.VITE_API_BASE_URL === "string"
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : "";

  return rawValue ? trimTrailingSlashes(rawValue) : "";
}

export function resolveApiUrl(url: string) {
  if (!url) {
    return url;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const apiBaseUrl = getConfiguredApiBaseUrl();
  if (!apiBaseUrl) {
    return url;
  }

  if (url.startsWith("/")) {
    return `${apiBaseUrl}${url}`;
  }

  return `${apiBaseUrl}/${trimLeadingSlash(url)}`;
}

