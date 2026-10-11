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
 * Lần đầu vào Mini App của 1 thương hiệu: tạo khách mới (sẽ gộp với khách cũ khi liên kết SĐT)
 * và tặng điểm chào mừng của thương hiệu.
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
  const welcome = await getNumberSetting(brand.id, 'welcomePoints');
  if (welcome > 0) {
    await changePoints(tx, {
      customerId: customer.id,
      brandId: brand.id,
      points: welcome,
      type: 'WELCOME',
      description: `Quà chào mừng thành viên mới ${brand.name}`,
    });
  }
  return { customerId: customer.id, isNew: true };
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

function maxDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
