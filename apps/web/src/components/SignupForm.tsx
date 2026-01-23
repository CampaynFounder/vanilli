'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { CountdownTimer } from './CountdownTimer';
import { shouldShowCountdown } from '@/config/launch';
import { useSignupModal } from '@/hooks/useSignupModal';
import { supabase } from '@/lib/supabase';

export function SignupForm() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const [showBackdrop, setShowBackdrop] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isInvestor, setIsInvestor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const { showModal } = useSignupModal();

  // Email regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Phone regex validation (supports various formats: (555) 123-4567, 555-123-4567, 5551234567, +1 555 123 4567, etc.)
  const phoneRegex = /^[+]?[1]?[\s\-().]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError('');
      return false;
    }
    if (!emailRegex.test(value)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePhone = (value: string): boolean => {
    if (!value) {
      setPhoneError('');
      return false;
    }
    // Remove common formatting characters for validation
    const cleanedPhone = value.replace(/[\s\-().]/g, '');
    if (!phoneRegex.test(value) || cleanedPhone.length < 10) {
      setPhoneError('Please enter a valid phone number');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value) {
      validateEmail(value);
    } else {
      setEmailError('');
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhone(value);
    if (value) {
      validatePhone(value);
    } else {
      setPhoneError('');
    }
  };

  const isFormValid = (): boolean => {
    return emailRegex.test(email) && phoneRegex.test(phone) && phone.replace(/[\s\-().]/g, '').length >= 10;
  };

  const handlePreLaunchLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showModal();
  };

  // Listen for button clicks to show modal (always works, even if already shown)
  useEffect(() => {
    const handleCustomEvent = () => {
      // Always show modal on button click, even if it was shown before
      setShowBackdrop(true);
      setTimeout(() => {
        setIsVisible(true);
      }, 200);
    };

    window.addEventListener('vannilli:show-signup', handleCustomEvent);
    return () => window.removeEventListener('vannilli:show-signup', handleCustomEvent);
  }, []); // No dependencies - always listen

  // Auto-show on mount (when triggered by GlobalSignupModal or page load)
  useEffect(() => {
    const triggerModal = () => {
      if (!hasShown && !showBackdrop) {
        setHasShown(true);
        setShowBackdrop(true);
        setTimeout(() => {
          setIsVisible(true);
        }, 200);
      }
    };

    // Check if we should auto-show (from GlobalSignupModal) - check immediately
    const shouldAutoShow = sessionStorage.getItem('vannilli_signup_auto_show') === 'true';
    
    if (shouldAutoShow) {
      // Clear the flag
      sessionStorage.removeItem('vannilli_signup_auto_show');
      // Small delay for smooth appearance
      const timer = setTimeout(triggerModal, 300);
      return () => clearTimeout(timer);
    }
  }, [hasShown, showBackdrop]);

  // Also check periodically for the flag (in case component mounts after flag is set)
  useEffect(() => {
    const checkFlag = setInterval(() => {
      if (!hasShown && !showBackdrop) {
        const shouldAutoShow = sessionStorage.getItem('vannilli_signup_auto_show') === 'true';
        if (shouldAutoShow) {
          sessionStorage.removeItem('vannilli_signup_auto_show');
          setHasShown(true);
          setShowBackdrop(true);
          setTimeout(() => {
            setIsVisible(true);
          }, 200);
        }
      }
    }, 500);

    return () => clearInterval(checkFlag);
  }, [hasShown, showBackdrop]);

  // Scroll trigger - show when scrolling past video gallery
  useEffect(() => {
    // Don't trigger if modal already shown or if auto-show is set
    const hasAutoShow = sessionStorage.getItem('vannilli_signup_auto_show') === 'true';
    if (hasShown || hasAutoShow || showBackdrop) return;

    const handleScroll = () => {
      // Get the video gallery section position
      const gallerySection = document.getElementById('gallery');
      if (!gallerySection) {
        // Fallback: trigger after 1000px scroll
        if (window.scrollY > 1000 && !hasShown) {
          setHasShown(true);
          setShowBackdrop(true);
          setTimeout(() => {
            setIsVisible(true);
          }, 200);
        }
        return;
      }

      const galleryBottom = gallerySection.offsetTop + gallerySection.offsetHeight;
      const scrollPosition = window.scrollY + window.innerHeight;

      // Trigger when user has scrolled past the gallery section (with 100px buffer)
      if (scrollPosition > galleryBottom + 100 && !hasShown) {
        setHasShown(true);
        // First show backdrop, then modal slides in
        setShowBackdrop(true);
        setTimeout(() => {
          setIsVisible(true);
        }, 200);
      }
    };

    // Use throttled scroll for better performance
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    
    // Check immediately and after a short delay (in case page is already scrolled)
    handleScroll();
    const timeout = setTimeout(handleScroll, 500);

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      clearTimeout(timeout);
    };
  }, [hasShown, showBackdrop]);

  const handleClose = () => {
    setIsVisible(false);
    // Delay backdrop fade out
    setTimeout(() => {
      setShowBackdrop(false);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate before submitting
    const emailValid = validateEmail(email);
    const phoneValid = validatePhone(phone);
    
    if (!emailValid || !phoneValid || isSubmitting || !isFormValid()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    
    try {
      // Get user agent and IP (if available)
      const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : null;
      
      // Insert into Supabase email_collections table
      // Note: Don't use .select() - anon role doesn't have SELECT permission
      const { error } = await supabase
        .from('email_collections')
        .insert({
          email: email.toLowerCase().trim(), // Normalize email
          phone: phone.trim(),
          is_investor: isInvestor,
          source: 'pre_launch_modal',
          user_agent: userAgent,
        });

      if (error) {
        console.error('Supabase error:', error);
        
        // Handle 42501 - Row Level Security policy violation
        // This means the RLS policy doesn't allow 'anon' role to insert
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          console.error('42501 RLS Policy Error - The anon role cannot insert:', {
            errorCode: error.code,
            errorMessage: error.message,
            fix: 'Run the SQL script: packages/database/fix-email-collections-rls-anon.sql in Supabase SQL Editor',
          });
          setSubmitError('Database policy error. Please ensure the RLS policy allows anonymous inserts. Contact support if this persists.');
          setIsSubmitting(false);
          return;
        }
        
        // Handle 401 Unauthorized - API key issue
        // Supabase returns 401 errors with codes like 'PGRST301' or messages containing '401'/'Unauthorized'
        if (error.code === 'PGRST301' || error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('JWT')) {
          console.error('401 Unauthorized - Check Supabase API key:', {
            hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            urlPreview: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
            keyPreview: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20),
          });
          setSubmitError('Authentication failed. Please verify Supabase API key is correctly configured.');
          setIsSubmitting(false);
          return;
        }
        
        // Handle duplicate email error gracefully
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
          setSubmitError('This email is already registered. Thank you for your interest!');
          // Still show success state
          setIsSubmitted(true);
          setTimeout(() => {
            handleClose();
          }, 3000);
        } else if (error.code === 'CONFIG_ERROR' || (error.message && error.message.includes('not configured'))) {
          // Supabase not configured
          console.error('Supabase configuration error:', {
            code: error.code,
            message: error.message,
            envCheck: {
              url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing',
              key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'missing'
            }
          });
          setSubmitError('Email collection is not yet configured. Please contact support.');
          setIsSubmitting(false);
          return;
        } else {
          console.error('Error submitting email:', error);
          setSubmitError(`Something went wrong: ${error.message || 'Please try again.'}`);
          setIsSubmitting(false);
          return;
        }
      } else {
        // Success
        setIsSubmitting(false);
        setIsSubmitted(true);
        // Close modal after 2 seconds
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
        } catch (err: unknown) {
      console.error('Unexpected error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Error details:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined
      });
      // Check if it's a network/configuration error
      if (errorMessage.includes('not configured') || errorMessage.includes('ERR_NAME_NOT_RESOLVED') || errorMessage.includes('Failed to fetch') || errorMessage.includes('CONFIG_ERROR')) {
        setSubmitError('Email collection is not yet configured. Please contact support. Check console for details.');
      } else {
        setSubmitError(`An unexpected error occurred: ${errorMessage || 'Please try again.'}`);
      }
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!showBackdrop) return null;

  if (!showBackdrop && !isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto ${
        showBackdrop ? 'block' : 'hidden'
      }`}
      onClick={handleBackdropClick}
    >
      {/* Backdrop with hero background image */}
      <div 
        className={`absolute inset-0 w-full h-full z-0 transition-opacity duration-500 ease-out ${
          showBackdrop ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
            backgroundImage: 'url(/images/hero-background.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Dark backdrop overlay */}
      <div 
        className={`absolute inset-0 bg-black/80 backdrop-blur-sm z-[1] transition-opacity duration-500 ease-out ${
          showBackdrop ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Modal Content - Slides in from center */}
      <div
        className={`relative z-[2] w-full max-w-md my-auto transform transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isVisible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-90 translate-y-8'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Better mobile positioning */}
        <button
          onClick={handleClose}
          className="absolute -top-10 sm:-top-12 right-0 sm:right-0 text-white hover:text-slate-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center p-2 z-10 bg-black/50 rounded-full backdrop-blur-sm"
          aria-label="Close signup modal"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Card - Scrollable on mobile */}
        <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-slate-800/50 p-6 sm:p-8 lg:p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Logo */}
          <div className="flex justify-center mb-4 sm:mb-6">
            <a href="/" className="flex items-center">
              <Image
                src="/logo/logo.png"
                alt="Vannilli"
                width={768}
                height={256}
                className="h-10 sm:h-12 w-auto"
                style={{
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </a>
          </div>

          <div className="text-center mb-5 sm:mb-6">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 sm:mb-3">
              {isSubmitted && !isInvestor ? "You're all Set!" : "Get Your Free Credits"}
            </h2>
            {!isSubmitted && (
              <p className="text-sm sm:text-base text-slate-300 px-2 mb-4">
                {shouldShowCountdown()
                  ? 'Enter your email to be notified when we launch and receive free credits'
                  : 'Enter your email to get started with free credits'}
              </p>
            )}
            
            {/* Countdown Timer */}
            {!isSubmitted && <CountdownTimer />}
          </div>

          {/* Email Form */}
          {isSubmitted ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              {isInvestor ? (
                <>
                  <p className="text-white font-semibold mb-2">You&apos;re All Set! Your Free Credits Are Locked In.</p>
                  <p className="text-slate-300 text-sm">
                    Someone from our team will reach out to you for our next investor call.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white font-semibold mb-2">Your Free Credits will be applied to the Email You Provided.</p>
                  <p className="text-slate-300 text-sm">
                    We&apos;ll keep you posted on the launch date via email or text.
                  </p>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={() => validateEmail(email)}
                  placeholder="your.email@gmail.com"
                  required
                  className={`w-full px-4 py-3.5 sm:py-4 bg-slate-800/50 border rounded-lg sm:rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 transition-all text-sm sm:text-base min-h-[48px] ${
                    emailError 
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                      : 'border-slate-700 focus:ring-purple-500 focus:border-transparent'
                  }`}
                  disabled={isSubmitting}
                />
                {emailError ? (
                  <p className="text-xs text-red-400 mt-2 px-1">{emailError}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-2 px-1">
                    Any email works - Gmail, Yahoo, Outlook, etc.
                  </p>
                )}
              </div>

              {/* Phone Number Input */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-2">
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={handlePhoneChange}
                  onBlur={() => validatePhone(phone)}
                  placeholder="(555) 123-4567"
                  required
                  className={`w-full px-4 py-3.5 sm:py-4 bg-slate-800/50 border rounded-lg sm:rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 transition-all text-sm sm:text-base min-h-[48px] ${
                    phoneError 
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                      : 'border-slate-700 focus:ring-purple-500 focus:border-transparent'
                  }`}
                  disabled={isSubmitting}
                />
                {phoneError ? (
                  <p className="text-xs text-red-400 mt-2 px-1">{phoneError}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-2 px-1">
                    Format: (555) 123-4567 or 555-123-4567
                  </p>
                )}
              </div>

              {/* Investor Interest Button */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsInvestor(!isInvestor)}
                  className={`w-full py-3.5 sm:py-4 rounded-lg sm:rounded-xl border-2 transition-all duration-300 min-h-[48px] flex items-center justify-center gap-2 ${
                    isInvestor
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                  disabled={isSubmitting}
                >
                  <svg
                    className={`w-5 h-5 transition-all ${isInvestor ? 'text-purple-400' : 'text-slate-400'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {isInvestor ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                  <span className="text-sm sm:text-base font-semibold">Investor Interest</span>
                </button>
              </div>

                  {/* Error Message */}
                  {submitError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {submitError}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={!isFormValid() || isSubmitting}
                    className="w-full bg-white hover:bg-white/95 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-lg sm:rounded-xl px-6 py-3.5 sm:py-4 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none min-h-[48px] flex items-center justify-center"
                  >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm sm:text-base">Submitting...</span>
                  </span>
                ) : (
                  <span className="text-sm sm:text-base">Get Free Credits</span>
                )}
              </button>
            </form>
          )}

          {/* Terms */}
          <p className="text-center text-[10px] sm:text-xs text-slate-400 mt-4 sm:mt-6 px-2">
            By continuing, you agree to Vannilli&apos;s{' '}
            <a 
              href="#" 
              onClick={handlePreLaunchLink}
              className="text-purple-400 hover:text-purple-300 underline cursor-pointer"
            >
              Terms of Service
            </a>
            {' '}and{' '}
            <a 
              href="#" 
              onClick={handlePreLaunchLink}
              className="text-purple-400 hover:text-purple-300 underline cursor-pointer"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

