import { create } from 'zustand';
import type { User } from '@/types';
import { authService, isTokenValid } from '@/services';
import { TOKEN_KEY } from '@/config/api';

type Status = 'checking' | 'authed' | 'anon';

interface AuthState {
  user: User | null;
  status: Status;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Parameters<typeof authService.updateProfile>[0]) => Promise<void>;
}

/** Auth state. The JWT itself lives in localStorage (TOKEN_KEY), managed by authService. */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',

  init: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!isTokenValid(token)) {
      localStorage.removeItem(TOKEN_KEY);
      set({ status: 'anon', user: null });
      return;
    }
    try {
      const user = await authService.me();
      set({ user, status: 'authed' });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ status: 'anon', user: null });
    }
  },

  login: async (email, password) => {
    const { user } = await authService.login(email, password);
    set({ user, status: 'authed' });
  },

  register: async (name, email, password) => {
    const { user } = await authService.register(name, email, password);
    set({ user, status: 'authed' });
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, status: 'anon' });
  },

  updateProfile: async (patch) => {
    const user = await authService.updateProfile(patch);
    set({ user });
  },
}));
