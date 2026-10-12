/**
 * Client API DCorp (Loyalty – đăng ký thành viên RK7 CRM qua SkyCRM).
 *
 * - POST {base}/auth/token         { client_id, client_secret, grant_type: "client_credentials" } → { access_token, expires_in }
 * - POST {base}/crm/cnv/register   Bearer token, body { firstName, middleName, lastName, email, phone, dateOfBirth, gender, organization }
 *
 * client_id / client_secret / organization cấp riêng cho từng thương hiệu và môi trường (UAT / PROD),
 * cấu hình trên trang quản trị (Thương hiệu → Kết nối POS), KHÔNG ghi vào mã nguồn.
 */
import type { Brand } from '@prisma/client';

export const DCORP_SANDBOX_URL = 'https://api-stg.dcorp.com.vn';
export const DCORP_PRODUCTION_URL = 'https://api.dcorp.com.vn';
const TIMEOUT_MS = 15_000;

/** Lỗi khi gọi DCorp. `retryable = false` nghĩa là dữ liệu sai, gửi lại cũng không thành công */
export class DcorpError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public code?: string | number,
    public httpStatus?: number,
  ) {
    super(message);
  }
}

/** Mã lỗi DCorp (Phụ lục III) */
export const DCORP_ERRORS: Record<string, string> = {
  '132': 'Organization not found',
  '105': 'Customer exist already',
  '107': 'Full name invalid',
  '108': 'Mobile invalid',
  '109': 'Email invalid',
  '110': 'Sync customer failed',
  '129': 'Last name max length is 60 characters',
  '130': 'First name max length is 20 characters',
  '131': 'Middle name max length is 20 characters',
  '134': 'Date of birth is required',
  '135': 'Date of birth invalid',
  '401': 'Unauthorized',
  '415': 'Unsupported Media Type',
};
/** Lỗi tạm thời bên DCorp → nên gửi lại */
const RETRYABLE_CODES = new Set(['110']);
export const DCORP_CUSTOMER_EXISTS = '105';

type DcorpConfig = Pick<Brand, 'id' | 'dcorpBaseUrl' | 'dcorpClientId' | 'dcorpClientSecret' | 'dcorpOrganization'>;

export function assertDcorpConfig(b: DcorpConfig) {
  if (!b.dcorpClientId || !b.dcorpClientSecret || !b.dcorpOrganization) {
    throw new DcorpError('Thương hiệu chưa cấu hình đủ client_id, client_secret, organization của DCorp', false);
  }
}

const baseUrl = (b: DcorpConfig) => (b.dcorpBaseUrl || DCORP_SANDBOX_URL).replace(/\/+$/, '');

// ---------------- Access token (cache theo thương hiệu) ----------------

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const cacheKey = (b: DcorpConfig) => `${b.id}|${baseUrl(b)}|${b.dcorpClientId}`;

export function clearDcorpToken(b: DcorpConfig) {
  tokenCache.delete(cacheKey(b));
}

export async function getDcorpToken(b: DcorpConfig): Promise<string> {
  assertDcorpConfig(b);
  const key = cacheKey(b);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  let res: Response;
  try {
    res = await fetch(`${baseUrl(b)}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: b.dcorpClientId, client_secret: b.dcorpClientSecret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new DcorpError(`Không kết nối được DCorp (lấy token): ${e instanceof Error ? e.message : e}`, true);
  }
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const msg = `Lấy token DCorp thất bại (HTTP ${res.status})${data.error_description ? `: ${data.error_description}` : ''}`;
    // 401 invalid_client = sai client_id/secret → không tự gửi lại
    throw new DcorpError(msg, res.status >= 500, data.error, res.status);
  }
  const ttl = Math.max(60, Number(data.expires_in ?? 3600));
  // Làm mới trước khi hết hạn 60 giây
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 });
  return data.access_token;
}

// ---------------- Chuyển đổi dữ liệu khách ----------------

/** DCorp chỉ chấp nhận chữ cái (kể cả tiếng Việt) và khoảng trắng */
const cleanName = (s: string) =>
  s
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Tách họ tên tiếng Việt theo ví dụ trong tài liệu DCorp
 * ("firstName": "Trần", "middleName": "Văn", "lastName": "Quý"):
 * từ đầu → firstName, từ cuối → lastName (bắt buộc), phần giữa → middleName.
 */
export function splitVietnameseName(fullName: string) {
  const words = cleanName(fullName).split(' ').filter(Boolean);
  if (words.length === 0) return { firstName: undefined, middleName: undefined, lastName: '' };
  if (words.length === 1) return { firstName: undefined, middleName: undefined, lastName: words[0].slice(0, 60) };
  const first = words[0];
  const last = words[words.length - 1];
  const middle = words.slice(1, -1).join(' ');
  return {
    firstName: first.slice(0, 20),
    middleName: middle ? middle.slice(0, 20).trim() : undefined,
    lastName: last.slice(0, 60),
  };
}

export interface DcorpCustomerInput {
  name: string;
  phone: string | null;
  birthday: Date | null;
  gender: string | null;
}

export function toDcorpRegister(c: DcorpCustomerInput, organization: number) {
  if (!c.phone) throw new DcorpError('Khách chưa có số điện thoại', false);
  if (!c.birthday) throw new DcorpError('Khách chưa có ngày sinh (DCorp bắt buộc)', false);
  const name = splitVietnameseName(c.name);
  if (!name.lastName) throw new DcorpError('Họ tên khách không hợp lệ', false);
  // Ngày sinh lưu dạng 00:00 UTC của ngày → gửi kèm múi giờ VN để không lệch ngày
  const dateOfBirth = `${c.birthday.toISOString().slice(0, 10)}T00:00:00+07:00`;
  return {
    ...(name.firstName ? { firstName: name.firstName } : {}),
    ...(name.middleName ? { middleName: name.middleName } : {}),
    lastName: name.lastName,
    phone: c.phone,
    dateOfBirth,
    // 0: Male, 1: Female; không gửi khi chưa rõ
    ...(c.gender === 'MALE' ? { gender: 0 } : c.gender === 'FEMALE' ? { gender: 1 } : {}),
    organization,
  };
}

// ---------------- Đăng ký thành viên ----------------

export interface DcorpRegisterResult {
  /** true = khách đã tồn tại bên DCorp (mã 105) – coi như đồng bộ thành công */
  alreadyExists: boolean;
  request: Record<string, unknown>;
  response: string;
}

export async function dcorpRegisterMember(b: Brand, c: DcorpCustomerInput): Promise<DcorpRegisterResult> {
  assertDcorpConfig(b);
  const body = toDcorpRegister(c, b.dcorpOrganization!);

  const call = async (token: string) => {
    try {
      return await fetch(`${baseUrl(b)}/crm/cnv/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new DcorpError(`Không kết nối được DCorp: ${e instanceof Error ? e.message : e}`, true);
    }
  };

  let res = await call(await getDcorpToken(b));
  if (res.status === 401) {
    // Token hết hạn sớm / bị thu hồi → lấy token mới và thử lại 1 lần
    clearDcorpToken(b);
    res = await call(await getDcorpToken(b));
  }
  const text = await res.text();
  let data: { success?: boolean; error?: unknown; message?: string | null } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* không phải JSON */
  }

  if (res.ok && data.success !== false) return { alreadyExists: false, request: body, response: text };

  const code = data.error != null ? String(data.error) : undefined;
  if (code === DCORP_CUSTOMER_EXISTS) return { alreadyExists: true, request: body, response: text };

  const desc = data.message || (code ? DCORP_ERRORS[code] : undefined) || text.slice(0, 200);
  const retryable = res.status >= 500 || (code !== undefined && RETRYABLE_CODES.has(code));
  throw new DcorpError(`DCorp từ chối (HTTP ${res.status}${code ? `, mã ${code}` : ''}): ${desc}`, retryable, code, res.status);
}
