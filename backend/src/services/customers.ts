import type { Brand } from '@prisma/client';
import { type Tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { memberCode } from '../lib/codes.js';
import { changePoints, recomputeTier, tierForSpent } from './loyalty.js';
import { getNumberSetting } from './settings.js';

export interface ZaloLogin {
  zaloId: string;
  name: string;
  avatar?: string;
  zaloOAId?: string;
  followedOA?: boolean;
}

/**
 * Tìm hoặc tạo khách theo tài khoản Zalo của Mini App thương hiệu.
 * Lần đầu vào Mini App của 1 thương hiệu: tạo khách mới (chưa đăng ký thành viên).
 * Khách hoàn tất đăng ký (SĐT, ngày sinh, cơ sở) qua `registerMember` – lúc đó mới tặng điểm chào mừng
 * và gộp với hồ sơ cũ nếu SĐT đã là thành viên.
 */
export async function loginWithZalo(tx: Tx, brand: Brand, login: ZaloLogin) {
  const account = await tx.customerZaloAccount.findUnique({
    where: { brandId_zaloId: { brandId: brand.id, zaloId: login.zaloId } },
  });
  if (account) {
    await tx.customerZaloAccount.update({
      where: { id: account.id },
      data: {
        lastLoginAt: new Date(),
        ...(login.zaloOAId ? { zaloOAId: login.zaloOAId } : {}),
        ...(login.followedOA !== undefined ? { followedOA: login.followedOA } : {}),
      },
    });
    if (login.avatar) await tx.customer.update({ where: { id: account.customerId }, data: { avatar: login.avatar } });
    return { customerId: account.customerId, isNew: false };
  }

  let code = memberCode();
  for (let i = 0; i < 5 && (await tx.customer.findUnique({ where: { memberCode: code } })); i++) code = memberCode();
  const tier = await tierForSpent(tx, 0);
  const customer = await tx.customer.create({
    data: {
      name: login.name,
      avatar: login.avatar,
      memberCode: code,
      tierId: tier?.id,
      zaloAccounts: {
        create: { brandId: brand.id, zaloId: login.zaloId, zaloOAId: login.zaloOAId, followedOA: login.followedOA ?? false },
      },
      wallets: { create: { brandId: brand.id } },
    },
  });
  return { customerId: customer.id, isNew: true };
}

export interface RegisterInput {
  name: string;
  phone: string;
  birthday: Date;
  branchId: number;
}

/**
 * Đăng ký thành viên tại thương hiệu: lưu tên, SĐT (từ Zalo), ngày sinh, cơ sở hay đến.
 * Nếu SĐT đã là thành viên (đăng ký ở thương hiệu khác hoặc được nhân viên tạo hoá đơn)
 * thì gộp tài khoản hiện tại vào hồ sơ đó. Tặng điểm chào mừng 1 lần cho mỗi thương hiệu.
 * Trả về id khách cuối cùng (khác `customerId` nếu đã gộp).
 */
export async function registerMember(tx: Tx, brand: Brand, customerId: number, input: RegisterInput) {
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || branch.brandId !== brand.id || !branch.active) throw badRequest('Cơ sở không hợp lệ');

  let finalId = customerId;
  const owner = await tx.customer.findUnique({ where: { phone: input.phone } });
  if (owner && owner.id !== customerId) {
    const current = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (current.phone && current.phone !== input.phone) {
      throw badRequest('Tài khoản đã liên kết số điện thoại khác, vui lòng liên hệ nhà hàng');
    }
    await mergeCustomers(tx, customerId, owner.id);
    finalId = owner.id;
  }

  // Gộp vào thành viên đã có: giữ tên & ngày sinh đã khai báo trước đó (form ở thương hiệu mới chỉ điền sẵn tên Zalo)
  const merged = finalId !== customerId;
  const target = await tx.customer.findUniqueOrThrow({ where: { id: finalId } });
  await tx.customer.update({
    where: { id: finalId },
    data: {
      phone: input.phone,
      name: merged && target.name ? target.name : input.name,
      birthday: merged && target.birthday ? target.birthday : input.birthday,
    },
  });
  const wallet = await tx.customerWallet.upsert({
    where: { customerId_brandId: { customerId: finalId, brandId: brand.id } },
    create: { customerId: finalId, brandId: brand.id },
    update: {},
  });
  const firstTime = !wallet.registeredAt;
  await tx.customerWallet.update({
    where: { id: wallet.id },
    data: { homeBranchId: branch.id, ...(firstTime ? { registeredAt: new Date() } : {}) },
  });
  if (firstTime) {
    const welcome = await getNumberSetting(brand.id, 'welcomePoints');
    if (welcome > 0) {
      await changePoints(tx, {
        customerId: finalId,
        brandId: brand.id,
        points: welcome,
        type: 'WELCOME',
        description: `Quà chào mừng thành viên mới ${brand.name}`,
      });
    }
  }
  return { customerId: finalId, merged: finalId !== customerId, firstTime };
}

/**
 * Gộp khách `sourceId` vào `targetId` (cùng 1 người dùng Mini App của nhiều thương hiệu,
 * nhận ra khi liên kết cùng số điện thoại). Chuyển toàn bộ tài khoản Zalo, ví điểm, voucher,
 * lịch đặt bàn, hoá đơn, lịch sử điểm sang `targetId` rồi xoá `sourceId`.
 */
export async function mergeCustomers(tx: Tx, sourceId: number, targetId: number) {
  if (sourceId === targetId) return;
  const [source, target] = await Promise.all([
    tx.customer.findUniqueOrThrow({ where: { id: sourceId }, include: { zaloAccounts: true, wallets: true } }),
    tx.customer.findUniqueOrThrow({ where: { id: targetId }, include: { zaloAccounts: true, wallets: true } }),
  ]);

  const conflict = source.zaloAccounts.find((a) => target.zaloAccounts.some((b) => b.brandId === a.brandId));
  if (conflict) {
    throw badRequest('Số điện thoại đã gắn với tài khoản Zalo khác trong cùng thương hiệu, vui lòng liên hệ nhà hàng');
  }

  await tx.customerZaloAccount.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });

  for (const w of source.wallets) {
    const existing = target.wallets.find((t) => t.brandId === w.brandId);
    if (existing) {
      await tx.customerWallet.update({
        where: { id: existing.id },
        data: {
          homeBranchId: existing.homeBranchId ?? w.homeBranchId,
          registeredAt: minDate(existing.registeredAt, w.registeredAt),
          points: { increment: w.points },
          lifetimePoints: { increment: w.lifetimePoints },
          totalSpent: { increment: w.totalSpent },
          visitCount: { increment: w.visitCount },
          lastVisitAt: maxDate(existing.lastVisitAt, w.lastVisitAt),
        },
      });
      await tx.customerWallet.delete({ where: { id: w.id } });
    } else {
      await tx.customerWallet.update({ where: { id: w.id }, data: { customerId: targetId } });
    }
  }

  const move = { where: { customerId: sourceId }, data: { customerId: targetId } };
  await tx.booking.updateMany(move);
  await tx.order.updateMany(move);
  await tx.customerVoucher.updateMany(move);
  await tx.pointTransaction.updateMany(move);

  await tx.customer.delete({ where: { id: sourceId } });
  await tx.customer.update({
    where: { id: targetId },
    data: {
      totalSpent: { increment: source.totalSpent },
      visitCount: { increment: source.visitCount },
      lastVisitAt: maxDate(target.lastVisitAt, source.lastVisitAt),
      avatar: target.avatar ?? source.avatar,
      birthday: target.birthday ?? source.birthday,
      gender: target.gender ?? source.gender,
      note: [target.note, source.note].filter(Boolean).join('\n') || null,
    },
  });
  await recomputeTier(tx, targetId);
}

function minDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
