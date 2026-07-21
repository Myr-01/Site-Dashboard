import { useState, useCallback } from 'react';

// Şifrəni sessionStorage-dan al (tab bağlanana qədər aktiv qalır)
export function getAdminPassword(): string | null {
  return sessionStorage.getItem('adminPassword');
}

// Bütün API çağırışlarına admin header-ini əlavə et
export function authHeaders(): Record<string, string> {
  const pass = getAdminPassword();
  return pass ? { 'x-admin-password': pass } : {};
}

// Qorunan əməliyyat icra etmək üçün hook
export function useAuth() {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Əməliyyatı icra etməzdən əvvəl şifrəni yoxla
  const withAuth = useCallback((action: () => void) => {
    const pass = getAdminPassword();
    if (pass) {
      // Şifrə artıq session-dadır, birbaşa icra et
      action();
    } else {
      // Şifrə yoxdur — modal göstər
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
