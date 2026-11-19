export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let csrf = "";
let sessionRequests: Promise<void> = Promise.resolve();

export function api(path: string, method = "GET", body?: unknown) {
  const refreshesSession = method === "GET" && path === "/auth/me";
  if (method === "GET" && !refreshesSession) return request(path, method, body);

  // Load session state before sending mutations. In-flight auth changes
  // are serialized so requests use the current cookie and CSRF token.
  const result = sessionRequests.then(async () => {
    const data = await request(path, method, body);
    if (refreshesSession || (method === "POST" && path === "/auth/login")) {
      csrf = data.csrf;
    } else if (method === "POST" && path === "/auth/logout") {
      csrf = "";
    }
    return data;
  });
  sessionRequests = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function request(path: string, method: string, body?: unknown) {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    if (r.ok) throw new ApiError("Respons perkhidmatan tidak sah.", 502);
  }
  if (!r.ok) {
    const retryHeader = r.headers.get("retry-after");
    const retryAfter =
      retryHeader && /^\d+$/.test(retryHeader)
        ? Number(retryHeader)
        : undefined;
    throw new ApiError(
      typeof data?.message === "string" && data.message.trim()
        ? data.message
        : "Perkhidmatan tidak tersedia.",
      r.status,
      retryAfter !== undefined && Number.isSafeInteger(retryAfter)
        ? retryAfter
        : undefined,
    );
  }
  return data;
}
export const malaysiaTime = (date: string) =>
  new Intl.DateTimeFormat("ms-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(date));
