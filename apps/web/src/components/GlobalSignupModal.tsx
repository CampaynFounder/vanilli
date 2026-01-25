'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SignupForm } from './SignupForm';

export function GlobalSignupModal() {
  const pathname = usePathname();
  const { session } = useAuth();

  useEffect(() => {
    // Suppress in all logged-in views
    if (session) return;

    // Show modal on any route/page load (once per session)
    const hasSeenModal = sessionStorage.getItem('vannilli_signup_seen');
    
    if (!hasSeenModal) {
      // Delay to ensure smooth page load
      const timer = setTimeout(() => {
        // Set flag for SignupForm to auto-show
        sessionStorage.setItem('vannilli_signup_auto_show', 'true');
        // Trigger custom event as well
        window.dispatchEvent(new CustomEvent('vannilli:show-signup'));
        sessionStorage.setItem('vannilli_signup_seen', 'true');
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [pathname, session]);

  // Show on link clicks (for navigation)
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      // Suppress in all logged-in views
      if (session) return;

      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      // Show modal when clicking internal links (except anchors and external links)
      if (link && link.href) {
        const isInternal = link.href.includes(window.location.origin) || link.href.startsWith('/');
        const isAnchor = link.href.includes('#');
        const isExternal = link.href.startsWith('http') && !link.href.includes(window.location.origin);
        
        if (isInternal && !isAnchor && !isExternal) {
          const hasSeenModal = sessionStorage.getItem('vannilli_signup_seen');
          if (!hasSeenModal) {
            sessionStorage.setItem('vannilli_signup_auto_show', 'true');
            window.dispatchEvent(new CustomEvent('vannilli:show-signup'));
            sessionStorage.setItem('vannilli_signup_seen', 'true');
          }
        }
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [session]);

  // Do not render the email/signup form for authenticated users on any view
  if (session) return null;
  return <SignupForm />;
}
