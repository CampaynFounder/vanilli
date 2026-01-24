/**
 * Launch Configuration
 * 
 * Set LAUNCH_DATE to your launch date/time
 * Set SHOW_COUNTDOWN to false to hide the countdown timer after launch
 */

export const LAUNCH_CONFIG = {
  // Launch date in ISO format (YYYY-MM-DDTHH:mm:ss)
  // Example: '2025-03-15T12:00:00' (March 15, 2025 at 12:00 PM)
  LAUNCH_DATE: process.env.NEXT_PUBLIC_LAUNCH_DATE || '2025-03-15T12:00:00',
  
  // Set to false to hide countdown timer (after launch)
  SHOW_COUNTDOWN: process.env.NEXT_PUBLIC_SHOW_COUNTDOWN !== 'false',
};

export function getLaunchDate(): Date {
  return new Date(LAUNCH_CONFIG.LAUNCH_DATE);
}

export function shouldShowCountdown(): boolean {
  return LAUNCH_CONFIG.SHOW_COUNTDOWN;
}


