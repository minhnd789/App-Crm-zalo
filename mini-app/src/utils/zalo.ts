import {
  followOA as sdkFollowOA,
  getAccessToken,
  getPhoneNumber,
  getUserInfo,
  openChat as sdkOpenChat,
  openPhone as sdkOpenPhone,
} from "zmp-sdk/apis";
import type { LoginInput } from "@/api/types";
import { isInZalo, isMockMode, OA_ID } from "./env";
import { storage } from "./storage";

const MOCK_ID_KEY = "mockZaloId";

/** ID giả lập lưu trong localStorage để giữ nguyên tài khoản giữa các lần mở app trên trình duyệt */
export function getMockZaloId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("mockZaloId");
  if (fromUrl) {
    storage.set(MOCK_ID_KEY, fromUrl);
    return fromUrl;
  }
  let id = storage.get(MOCK_ID_KEY);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    storage.set(MOCK_ID_KEY, id);
  }
  return id;
}

/** Thu thập dữ liệu đăng nhập: thật (zmp-sdk) hoặc giả lập */
export async function buildLoginPayload(): Promise<LoginInput> {
  if (isMockMode()) {
    return { mockZaloId: getMockZaloId(), name: "Khách dùng thử" };
  }
  let info: { name?: string; avatar?: string; idByOA?: string; followedOA?: boolean } = {};
  try {
    const { userInfo } = await getUserInfo({ autoRequestPermission: true });
    info = userInfo;
  } catch {
    // Người dùng từ chối chia sẻ tên/ảnh đại diện – vẫn đăng nhập được bằng access token
  }
  const accessToken = await getAccessToken();
  return {
    accessToken,
    name: info.name || undefined,
    avatar: info.avatar || undefined,
    idByOA: info.idByOA || undefined,
    followedOA: info.followedOA,
  };
}

/** Lấy token số điện thoại (thật) – trả về body cho POST /me/phone */
export async function requestPhonePayload(): Promise<{ token: string; accessToken: string }> {
  const { token } = await getPhoneNumber();
  if (!token) throw new Error("Không lấy được số điện thoại từ Zalo");
  const accessToken = await getAccessToken();
  return { token, accessToken };
}

export async function followOA(): Promise<void> {
  if (isMockMode()) return;
  if (!OA_ID) throw new Error("Chưa cấu hình VITE_ZALO_OA_ID");
  await sdkFollowOA({ id: OA_ID });
}

export async function openOAChat(): Promise<void> {
  if (!OA_ID) throw new Error("Nhà hàng chưa cấu hình Official Account");
  if (!isInZalo()) {
    window.open(`https://zalo.me/${OA_ID}`, "_blank");
    return;
  }
  await sdkOpenChat({ type: "oa", id: OA_ID });
}

export async function callPhone(phone: string): Promise<void> {
  if (isInZalo()) {
    try {
      await sdkOpenPhone({ phoneNumber: phone });
      return;
    } catch {
      /* fallback tel: */
    }
  }
  window.location.href = `tel:${phone}`;
}
