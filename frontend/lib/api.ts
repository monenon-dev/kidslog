// access 토큰은 메모리에만 두고, 새로고침 시 httpOnly refresh 쿠키로 다시 받는다.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function setAccessToken(t: string | null) {
  accessToken = t;
}

export async function refreshAccess(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (!r.ok) return false;
      const data = await r.json();
      accessToken = data.access_token;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function errorMessage(r: Response): Promise<string> {
  try {
    const data = await r.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((d: { msg: string }) => d.msg).join(", ");
  } catch {}
  return `요청 실패 (${r.status})`;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const doFetch = () => {
    const headers = new Headers(rest.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    return fetch(`/api${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  };
  let r = await doFetch();
  if (r.status === 401 && !path.startsWith("/auth/") && (await refreshAccess())) {
    r = await doFetch();
  }
  if (!r.ok) throw new ApiError(r.status, await errorMessage(r));
  if (r.status === 204) return undefined as T;
  return r.json();
}

/** 서명 URL로 스토리지에 직접 PUT (R2 또는 로컬). 실패 시 재시도. */
export async function putToStorage(url: string, file: File, retries = 2): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (r.ok) return;
      if (r.status < 500 || attempt >= retries) throw new ApiError(r.status, `업로드 실패 (${r.status})`);
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await new Promise((res) => setTimeout(res, 500 * 2 ** attempt));
  }
}
