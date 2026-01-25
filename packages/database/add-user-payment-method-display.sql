-- ============================================================================
-- ADD PAYMENT METHOD DISPLAY COLUMNS TO USERS TABLE
-- ============================================================================
-- Store last4 and brand of the customer's default payment method for display
-- (e.g. "•••• 4242" and "Visa"). Set by stripe-webhook when a PM is attached.

ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;
