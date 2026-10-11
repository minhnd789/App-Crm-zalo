import type { AdminUser, Role } from '../api/types';

/** Quản lý (ADMIN) có toàn quyền; nhân viên (STAFF) chỉ thao tác nghiệp vụ */
export const isManager = (u: Pick<AdminUser, 'role'> | null | undefined) => u?.role === 'ADMIN';

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Quản lý', STAFF: 'Nhân viên' };
