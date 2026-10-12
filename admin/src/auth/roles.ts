import type { AdminUser, Role } from '../api/types';

/** Quản lý (ADMIN) – của thương hiệu hoặc toàn hệ thống */
export const isManager = (u: Pick<AdminUser, 'role'> | null | undefined) => u?.role === 'ADMIN';

/** Quản trị toàn hệ thống: role ADMIN và không gắn thương hiệu – quản lý thương hiệu, hạng dùng chung */
export const isSuperAdmin = (u: Pick<AdminUser, 'role' | 'brandId'> | null | undefined) => u?.role === 'ADMIN' && u.brandId === null;

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Quản lý', STAFF: 'Nhân viên' };
