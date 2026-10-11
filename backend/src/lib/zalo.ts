import { config } from '../config.js';
import { badRequest } from './errors.js';

export interface ZaloProfile {
  id: string;
  name: string;
  avatar?: string;
}

const GRAPH = 'https://graph.zalo.me/v2.0';

/**
 * Xác thực access token do Mini App gửi lên (zmp-sdk getAccessToken)
 * và lấy thông tin người dùng Zalo.
 */
export async function getZaloProfile(accessToken: string): Promise<ZaloProfile> {
  const res = await fetch(`${GRAPH}/me?fields=id,name,picture`, {
    headers: { access_token: accessToken },
  });
  const data = (await res.json()) as {
    id?: string;
    name?: string;
    picture?: { data?: { url?: string } };
    error?: number;
    message?: string;
  };
  if (!res.ok || !data.id || (data.error && data.error !== 0)) {
    throw badRequest(`Không xác thực được tài khoản Zalo${data.message ? `: ${data.message}` : ''}`);
  }
  return { id: data.id, name: data.name ?? 'Khách hàng', avatar: data.picture?.data?.url };
}

/**
 * Đổi token từ zmp-sdk getPhoneNumber thành số điện thoại thật.
 * Cần ZALO_APP_SECRET_KEY và quyền "Số điện thoại" đã được duyệt cho Mini App.
 */
export async function getZaloPhone(accessToken: string, phoneToken: string): Promise<string> {
  if (!config.zalo.appSecretKey) throw badRequest('Chưa cấu hình ZALO_APP_SECRET_KEY');
  const res = await fetch(`${GRAPH}/me/info`, {
    headers: { access_token: accessToken, code: phoneToken, secret_key: config.zalo.appSecretKey },
  });
  const data = (await res.json()) as { data?: { number?: string }; error?: number; message?: string };
  const number = data.data?.number;
  if (!res.ok || !number) {
    throw badRequest(`Không lấy được số điện thoại${data.message ? `: ${data.message}` : ''}`);
  }
  return number.replace(/^84/, '0');
}

/**
 * Gửi tin nhắn tư vấn từ OA tới người dùng (best-effort, lỗi chỉ ghi log).
 * Lưu ý: Zalo chỉ cho gửi tin tư vấn miễn phí khi người dùng có tương tác với OA gần đây;
 * với thông báo giao dịch chính thức nên dùng ZNS.
 */
export async function sendOAMessage(zaloUserId: string, text: string): Promise<void> {
  if (!config.zalo.oaAccessToken || config.zalo.mock) {
    console.info(`[OA] (bỏ qua – chưa cấu hình) → ${zaloUserId}: ${text}`);
    return;
  }
  try {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: config.zalo.oaAccessToken },
      body: JSON.stringify({ recipient: { user_id: zaloUserId }, message: { text } }),
    });
    const data = (await res.json()) as { error?: number; message?: string };
    if (data.error && data.error !== 0) console.warn('[OA] gửi tin thất bại:', data.message);
  } catch (e) {
    console.warn('[OA] gửi tin thất bại:', e);
  }
}
