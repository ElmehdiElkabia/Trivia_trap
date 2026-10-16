const PRODUCTION_API_BASE_URL =
  "https://trivia-trap-api-3fe6377c53b3.herokuapp.com";

const isLoopback = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  // Use the deployed FastAPI service by default in production. NEXT_PUBLIC_API_BASE_URL
  // can still override this during the frontend build.
  if (!configured && process.env.NODE_ENV === "production") {
    return PRODUCTION_API_BASE_URL;
  }

  const browserHost = typeof window === "undefined" ? undefined : window.location.hostname;

  // A login cookie belongs to a hostname, even when frontend and API use different ports.
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
  // UI callers may use the legacy same-origin /api prefix. The FastAPI service
  // exposes routes directly, e.g. /auth/register, so strip /api for remote API calls.
  const requestPath =
    baseUrl !== "/api" && path.startsWith("/api/") ? path.slice(4) : path;

  return fetch(`${baseUrl}${requestPath}`, {
    ...options,
    credentials: "include",
  });
}
