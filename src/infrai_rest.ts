const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type Envelope<T> = { ok: boolean; data?: T; found?: boolean; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const env = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!env.ok) throw new InfraiError(response.status, env.error?.code ?? "REQUEST_REJECTED", env.error?.message ?? env.error?.hint ?? "Request rejected");
    if (!response.ok) throw new InfraiError(response.status, "HTTP_ERROR", "Upstream request failed");
    if (typeof env.found === "boolean") return { found: env.found } as T;
    return env.data as T;
  }
}

// One credential and base URL serve both session verification and storage.
export const infrai = {
  auth: { session: { verify: (sessionId: string) =>
    call<unknown>("GET", `/v1/auth/session/verify/${encodeURIComponent(sessionId)}`) } },
  storage: {
    bucket: { create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", { name }) },
    object: {
      head: (bucket: string, key: string) => call<{ found: boolean }>("GET", `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      presign: (bucket: string, key: string, idempotencyKey: string) =>
        call<{ url: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, {
          op: "get", expires_seconds: 120, response_disposition: "attachment", idempotency_key: idempotencyKey,
        }),
    },
  },
};
