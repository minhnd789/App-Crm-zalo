import { useAuth } from './AuthContext';
import { isManager, isSuperAdmin } from './roles';

export const useIsManager = () => isManager(useAuth().user);
export const useIsSuperAdmin = () => isSuperAdmin(useAuth().user);
