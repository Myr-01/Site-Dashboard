import { useState, useCallback } from 'react';
import { apiUrl } from './api';

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

// Bütün API çağırışlarına admin header-ini əlavə et
export function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { 'x-admin-token': token } : {};
}

/**
 * Şifrəni server-də yoxla, uğurlu olduqda JWT token-i session-da saxla.
 * Şifrənin özü heç vaxt saxlanılmır.
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

// Qorunan əməliyyat icra etmək üçün hook
export function useAuth() {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Əməliyyatı icra etməzdən əvvəl sessiya token-ini yoxla
  const withAuth = useCallback((action: () => void) => {
    const token = getAdminToken();
    if (token) {
      // Token artıq session-dadır, birbaşa icra et
      action();
    } else {
      // Token yoxdur — modal göstər
      setPendingAction(() => action);
      setShowAuthModal(true);
    }
  }, []);

  // Şifrə doğrulandıqdan sonra
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
