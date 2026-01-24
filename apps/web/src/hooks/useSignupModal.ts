'use client';

import { useCallback } from 'react';

/**
 * Hook to trigger the signup modal
 * Use this to show the modal from any component
 */
export function useSignupModal() {
  const showModal = useCallback(() => {
    // Set flag to trigger modal
    sessionStorage.setItem('vannilli_signup_auto_show', 'true');
    // Dispatch custom event to trigger modal
    window.dispatchEvent(new CustomEvent('vannilli:show-signup'));
  }, []);

  return { showModal };
}


