'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SignupForm } from './SignupForm';

export function GlobalSignupModal() {
  const [shouldShow, setShouldShow] = useState(true); // Always render SignupForm
  const pathname = usePathname();

  useEffect(() => {
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
  }, [pathname]);

  // Show on link clicks (for navigation)
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
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
            setShouldShow(true);
            sessionStorage.setItem('vannilli_signup_seen', 'true');
          }
        }
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, []);

  // Always render SignupForm - it will handle its own visibility
  return <SignupForm />;
}
