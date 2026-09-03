import { useState, useCallback, useEffect } from 'react';
import { apiUrl } from './api';

export interface CurrentUser {
  id: number | null;
  email: string | null;
  role: string;
  guest_target?: number | null;
}

export interface GuestAccount {
  id: number;
  label: string;
  is_admin: boolean;
  site_count: number;
}

// Qonaq üçün hesab siyahısını al (public — auth tələb etmir)
export async function fetchGuestAccounts(): Promise<GuestAccount[]> {
  try {
    const res = await fetch(apiUrl('/api/auth/accounts'));
    if (!res.ok) return [];
    return (await res.json()) as GuestAccount[];
  } catch {
    return [];
  }
}

// Qonaq kimi giriş — seçilmiş hesabın saytlarını read-only görmək üçün token al
export async function loginAsGuest(userId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/guest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.token) {
    setAdminToken(data.token);
    if (data.user) setCachedUser(data.user);
    return { ok: true };
  }
  return { ok: false, error: data?.error || 'Qonaq girişi uğursuz oldu' };
}

// JWT sessiya token-ini sessionStorage-dan al (tab bağlanana qədər aktiv qalır)
export function getAdminToken(): string | null {
  return sessionStorage.getItem('adminToken');
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem('adminToken', token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem('adminToken');
}

// Cari user məlumatını sessionStorage-da keşlə (UI üçün — həqiqi mənbə JWT-dir)
export function getCachedUser(): CurrentUser | null {
  const raw = sessionStorage.getItem('currentUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function setCachedUser(user: CurrentUser): void {
  sessionStorage.setItem('currentUser', JSON.stringify(user));
}

export function clearCachedUser(): void {
  sessionStorage.removeItem('currentUser');
}

// Bütün API çağırışlarına auth header-ini əlavə et
export function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { 'x-admin-token': token } : {};
}

/**
 * Email + şifrə ilə giriş. Uğurlu olduqda JWT token və user session-da saxlanılır.
 * 2FA tələb olunursa { requires2FA: true } qaytarır.
 */
export async function loginWithEmail(
  email: string,
  password: string,
  totpToken?: string
): Promise<{ ok: boolean; requires2FA?: boolean; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, totp_token: totpToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.token) {
    setAdminToken(data.token);
    if (data.user) setCachedUser(data.user);
    return { ok: true };
  }
  if (data?.requires2FA) {
    return { ok: false, requires2FA: true };
  }
  return { ok: false, error: data?.error || 'Giriş uğursuz oldu' };
}

/**
 * Email + şifrə ilə qeydiyyat. Uğurlu olduqda avtomatik login (token saxlanılır).
 */
export async function registerWithEmail(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.token) {
    setAdminToken(data.token);
    if (data.user) setCachedUser(data.user);
    return { ok: true };
  }
  return { ok: false, error: data?.error || 'Qeydiyyat uğursuz oldu' };
}

/**
 * KÖHNƏ admin giriş yolu (yalnız şifrə). Geriyə uyğunluq üçün saxlanılır.
 */
export async function loginWithPassword(password: string): Promise<boolean> {
  const res = await fetch(apiUrl('/api/auth/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (!data?.token) return false;
  setAdminToken(data.token);
  return true;
}

/**
 * Serverdən cari user məlumatını çək (token etibarlılığını da yoxlayır).
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const res = await fetch(apiUrl('/api/auth/me'), { headers: authHeaders() });
    if (!res.ok) return null;
    const user = (await res.json()) as CurrentUser;
    setCachedUser(user);
    return user;
  } catch {
    return null;
  }
}

export function logout(): void {
  fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: authHeaders() }).catch(() => {});
  clearAdminToken();
  clearCachedUser();
}

// === ADMIN PANEL API HELPER-LƏRİ ===

export interface AdminStats { total_users: number; total_sites: number; issue_sites: number; }
export interface AdminUser {
  id: number; email: string | null; username: string | null;
  role: string; disabled: number; created_at: string; site_count: number;
}
export interface AdminSite {
  id: number; name: string; url: string; group_name: string | null;
  maintenance_mode: number; created_at: string;
  owner_email: string | null; owner_id: number | null;
  status: string | null; checked_at: string | null;
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const adminApi = {
  stats: () => adminGet<AdminStats>('/api/admin/stats'),
  users: () => adminGet<AdminUser[]>('/api/admin/users'),
  sites: () => adminGet<AdminSite[]>('/api/admin/sites'),

  async setUserDisabled(id: number, disabled: boolean) {
    const res = await fetch(apiUrl(`/api/admin/users/${id}/disable`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ disabled }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },

  async deleteUser(id: number) {
    const res = await fetch(apiUrl(`/api/admin/users/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },

  async regeneratePasscode() {
    const res = await fetch(apiUrl('/api/admin/sensitive-code/regenerate'), {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async saveBranding(data: { title?: string; primary_color?: string }) {
    const res = await fetch(apiUrl('/api/admin/branding'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async uploadBrandingImage(kind: 'logo' | 'favicon', file: File) {
    const fd = new FormData();
    fd.append(kind, file);
    const res = await fetch(apiUrl(`/api/admin/branding/${kind}`), {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },
};

/**
 * Tətbiqin auth vəziyyətini idarə edən hook.
 * user null = giriş edilməyib (login səhifəsi göstərilməlidir).
 */
export function useAuthState() {
  const [user, setUser] = useState<CurrentUser | null>(getCachedUser());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAdminToken();
      if (!token) {
        if (!cancelled) { setUser(null); setChecking(false); }
        return;
      }
      const me = await fetchCurrentUser();
      if (!cancelled) {
        if (me) setUser(me);
        else { clearAdminToken(); clearCachedUser(); setUser(null); }
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onLoggedIn = useCallback(async () => {
    const me = await fetchCurrentUser();
    setUser(me);
  }, []);

  const doLogout = useCallback(() => {
    logout();
    setUser(null);
  }, []);

  return { user, checking, setUser, onLoggedIn, doLogout };
}

// Qorunan əməliyyat icra etmək üçün hook (mövcud davranış saxlanılır)
export function useAuth() {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const withAuth = useCallback((action: () => void) => {
    const token = getAdminToken();
    if (token) {
      action();
    } else {
      setPendingAction(() => action);
      setShowAuthModal(true);
    }
  }, []);

  const onAuthSuccess = useCallback(() => {
    setShowAuthModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const onAuthClose = useCallback(() => {
    setShowAuthModal(false);
    setPendingAction(null);
  }, []);

  return { withAuth, showAuthModal, onAuthSuccess, onAuthClose };
}
