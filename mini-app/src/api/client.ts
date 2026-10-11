import { API_URL } from "@/utils/env";

/** Lỗi trả về từ API, `message` là thông báo tiếng Việt từ backend */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let token: string | null = null;
let reauth: (() => Promise<string | null>) | null = null;

export function setToken(t: string | null) {
  token = t;
}

export function getToken() {
  return token;
}

/** Hàm được gọi khi token hết hạn (401) để đăng nhập lại; trả về token mới */
export function setReauthHandler(fn: (() => Promise<string | null>) | null) {
  reauth = fn;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  query?: Query;
  /** Không gửi token (API công khai) */
  public?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const url = `${API_URL}/api/app${path}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${url}?${qs}` : url;
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.public && token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Không thể kết nối máy chủ, vui lòng kiểm tra mạng và thử lại", 0);
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await doFetch(path, opts);

  // Token hết hạn → đăng nhập lại một lần rồi thử lại
  if (res.status === 401 && !opts.public && reauth) {
    const newToken = await reauth().catch(() => null);
    if (newToken) {
      token = newToken;
      res = await doFetch(path, opts);
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Có lỗi xảy ra (mã ${res.status}), vui lòng thử lại`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Có lỗi xảy ra, vui lòng thử lại";
}
