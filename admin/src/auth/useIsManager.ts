import { useAuth } from './AuthContext';
import { isManager } from './roles';

export const useIsManager = () => isManager(useAuth().user);
