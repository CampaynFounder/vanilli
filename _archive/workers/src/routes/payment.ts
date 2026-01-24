/**
 * Payment and billing routes (Stripe integration)
 */

import { Hono } from 'hono';
import Stripe from 'stripe';
import { requireAuth, getSupabaseClient } from '../lib/auth';
import { TIER_RATES } from '@vannilli/music-calculator';
import type { Env, AuthUser } from '../types';

export const paymentRoutes = new Hono<{ Bindings: Env }>();

/**
 * Get Stripe client
 */
function getStripeClient(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Stripe product/price configuration
 */
const STRIPE_PRICES = {
  open_mic: { priceId: 'price_open_mic', amount: 1500 },      // $15 one-time
  indie_artist: { priceId: 'price_indie_artist', amount: 1500 }, // $15/month (deprecated)
  artist: { priceId: 'price_artist', amount: 2000 },           // $20/month
  label: { priceId: 'price_label', amount: 5000 },             // $50/month
};

/**
 * POST /api/checkout
 * Create Stripe Checkout session
 */
paymentRoutes.post('/checkout', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { type, tier, credits, successUrl, cancelUrl } = await c.req.json();

  if (!type || !successUrl || !cancelUrl) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Type, successUrl, and cancelUrl are required',
        },
      },
      400
    );
  }

  const stripe = getStripeClient(c.env);
  const supabase = getSupabaseClient(c.env);

  // Get or create Stripe customer
  let customerId = user.id; // Using Supabase user ID as customer ID
  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!userData?.stripe_customer_id) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        supabase_user_id: user.id,
      },
    });
    customerId = customer.id;

    // Save customer ID
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  } else {
    customerId = userData.stripe_customer_id;
  }

  try {
    if (type === 'subscription') {
      // Subscription checkout
      if (!tier || !(tier in STRIPE_PRICES)) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Valid tier required for subscription',
            },
          },
          400
        );
      }

      const priceConfig = STRIPE_PRICES[tier as keyof typeof STRIPE_PRICES];

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceConfig.priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          supabase_user_id: user.id,
          tier,
        },
      });

      return c.json({
        checkoutUrl: session.url!,
        sessionId: session.id,
      });
    } else if (type === 'topup') {
      // One-time credit top-up
      if (!credits || credits < 10) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Credits must be at least 10',
            },
          },
          400
        );
      }

      // Price: $0.30 per credit for top-ups
      const amount = Math.round(credits * 30); // cents

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Vannilli Credits',
                description: `${credits} seconds of video generation`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          supabase_user_id: user.id,
          credits: credits.toString(),
          type: 'topup',
        },
      });

      return c.json({
        checkoutUrl: session.url!,
        sessionId: session.id,
      });
    } else {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Type must be "subscription" or "topup"',
          },
        },
        400
      );
    }
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return c.json(
      {
        error: {
          code: 'STRIPE_ERROR',
          message: 'Failed to create checkout session',
        },
      },
      500
    );
  }
});

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
paymentRoutes.post('/webhooks/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const body = await c.req.text();
  const stripe = getStripeClient(c.env);
  const supabase = getSupabaseClient(c.env);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Handle events
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;

        if (!userId) break;

        // Handle subscription
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId =
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          const tier = session.metadata?.tier as keyof typeof TIER_RATES;

          // Create subscription record
          await supabase.from('subscriptions').insert({
            user_id: userId,
            stripe_subscription_id: subscriptionId,
            tier,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });

          // Add included credits
          const tierConfig = TIER_RATES[tier];
          await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_credits: tierConfig.included,
          });

          // Update user tier
          await supabase.from('users').update({ tier }).eq('id', userId);
        }

        // Handle top-up
        if (session.mode === 'payment' && session.metadata?.type === 'topup') {
          const credits = parseInt(session.metadata.credits, 10);
          await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_credits: credits,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (!userId) break;

        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id);

        // Downgrade user to free tier
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (sub) {
          await supabase.from('users').update({ tier: 'free' }).eq('id', sub.user_id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscriptionId =
            typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;

          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }

  return c.json({ received: true });
});

/**
 * GET /api/credits/balance
 * Get user's credit balance
 */
paymentRoutes.get('/credits/balance', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const supabase = getSupabaseClient(c.env);

  // Get subscription info
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  const tierConfig = TIER_RATES[user.tier];

  // Calculate usage this period (simplified - would need more logic for actual period tracking)
  const usedThisPeriod = tierConfig.included - user.creditsRemaining;

  return c.json({
    creditsRemaining: user.creditsRemaining,
    tier: user.tier,
    includedPerMonth: tierConfig.included,
    usedThisPeriod: Math.max(0, usedThisPeriod),
    periodEnd: subscription?.current_period_end || null,
  });
});

/**
 * GET /api/activity/payments
 * Get user's payment and subscription history
 */
paymentRoutes.get('/activity/payments', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const supabase = getSupabaseClient(c.env);

  // Get subscription history
  const { data: subscriptions} = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Get audit log for credit purchases and additions
  const { data: auditLog, error, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .in('action', ['credit_purchase', 'subscription_created', 'subscription_renewed', 'referral_credit_earned'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch payment history',
        },
      },
      500
    );
  }

  return c.json({
    subscriptions: subscriptions || [],
    activity: auditLog || [],
    total: count || 0,
    limit,
    offset,
  });
});


