const PRODUCTION_API_BASE_URL = "/api";

const isLoopback = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  const browserHost = typeof window === "undefined" ? undefined : window.location.hostname;

  // In production, route API traffic through Next.js so auth cookies are first-party.
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_API_BASE_URL;
  }

  if (browserHost && isLoopback(browserHost)) {
    if (!configured) return `http://${browserHost}:8000`;
    const url = new URL(configured);
    if (isLoopback(url.hostname)) {
      url.hostname = browserHost;
      return url.toString().replace(/\/$/, "");
    }
  }

  return (configured ?? "http://localhost:8000").replace(/\/$/, "");
}

export function apiMediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${apiBaseUrl()}${path}`;
}

/** Browser requests include the HttpOnly login cookie automatically. */
export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API paths must start with a single slash.");
  }

  const baseUrl = apiBaseUrl();
  let requestUrl: string;
  if (baseUrl === "/api") {
    // Accept both /auth/me and legacy /api/auth/me callers without double-prefixing.
    requestUrl = path.startsWith("/api/") ? path : `/api${path}`;
  } else {
    const requestPath = path.startsWith("/api/") ? path.slice(4) : path;
    requestUrl = `${baseUrl}${requestPath}`;
  }

  return fetch(requestUrl, {
    ...options,
    credentials: "include",
  });
}
