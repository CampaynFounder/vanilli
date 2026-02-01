/**
 * GA4 events for /socialbeta post-launch signup flow.
 * Include plan_id in events for funnel and abandonment tracking.
 */

export function trackSocialBetaEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

export const SOCIALBETA_EVENTS = {
  planSelected: (planId: string) =>
    trackSocialBetaEvent('socialbeta_plan_selected', { plan_id: planId }),

  getFreeCreditsClick: (planId: string) =>
    trackSocialBetaEvent('socialbeta_get_free_credits_click', { plan_id: planId }),

  stripeStarted: (planId: string) =>
    trackSocialBetaEvent('socialbeta_stripe_started', { plan_id: planId }),

  cardLinked: (planId: string) =>
    trackSocialBetaEvent('socialbeta_card_linked', { plan_id: planId }),

  credentialsFormShown: (planId: string) =>
    trackSocialBetaEvent('socialbeta_credentials_form_shown', { plan_id: planId }),

  credentialsCreated: (planId: string) =>
    trackSocialBetaEvent('socialbeta_credentials_created', { plan_id: planId }),

  complete: (planId: string) =>
    trackSocialBetaEvent('socialbeta_complete', { plan_id: planId }),

  abandon: (step: string, planId?: string) =>
    trackSocialBetaEvent('socialbeta_abandon', { step, ...(planId && { plan_id: planId }) }),
} as const;
