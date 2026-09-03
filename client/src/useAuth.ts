import { useState, useCallback, useEffect } from 'react';
import { apiUrl } from './api';

export interface CurrentUser {
  id: number | null;
  email: string | null;
  role: string;
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
