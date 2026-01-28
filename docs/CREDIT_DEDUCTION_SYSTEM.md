# Credit Deduction System

## Overview

Credits are deducted **immediately when a generation request is created** (status='pending'), not when it completes. This ensures users are charged as soon as they submit a request, and we always retrieve the request and subtract credits.

## Architecture

### 1. Database Trigger (Primary Method)

**File**: `packages/database/deduct-credits-on-generation-created.sql`

**Trigger**: `trg_generation_created_deduct_credits`
- Fires: `BEFORE INSERT OR UPDATE` on `generations` table
- Condition: `status = 'pending'` AND `cost_credits > 0` AND `credits_deducted = false`
- Action:
  1. Gets `user_id` from either `projects` (legacy) or `video_jobs` (demo/industry)
  2. Calls `deduct_credits(user_id, cost_credits)` (atomic with balance check)
  3. Sets `credits_deducted = true` and `credits_deducted_at = NOW()`
  4. Logs transaction to `audit_log` with full metadata

**Idempotency**: The `credits_deducted` flag prevents double-charging. If credits are already deducted, the trigger skips.

### 2. Worker Loop Safeguard (Secondary Method)

**File**: `modal_app/worker_loop.py`

**Location**: Before processing each job

**Action**:
1. Checks if `credits_deducted = false` for the generation
2. If not deducted and `cost_credits > 0`, calls `retry_credit_deduction()` function
3. Logs success/failure

**Purpose**: Ensures we **ALWAYS** retrieve the request and subtract credits, even if the trigger failed or was missed.

### 3. Manual Retry Function

**Function**: `retry_credit_deduction(p_generation_id UUID)`

**Purpose**: Manually retry credit deduction for generations that may have been missed.

**Features**:
- Idempotent (checks `credits_deducted` flag first)
- Logs to `audit_log`
- Returns `true` if successful, `false` if insufficient credits

**Usage**:
```sql
SELECT retry_credit_deduction('generation-uuid-here');
```

## Activity Logging

All credit transactions are logged to `audit_log` table with:

**Action Types**:
- `credits_deducted` - Successful deduction
- `credits_deduction_failed` - Failed attempt (insufficient credits)

**Metadata** (JSONB):
```json
{
  "generation_id": "uuid",
  "credits_deducted": 10,
  "credits_before": 100,
  "credits_after": 90,
  "tier": "artist",
  "status": "pending",
  "trigger": "generation_created" | "manual_retry"
}
```

## Multi-Tier Support

The system handles all tiers:

1. **Legacy (projects)**: Gets `user_id` from `projects.user_id`
2. **Demo/Industry (video_jobs)**: Gets `user_id` from `video_jobs.user_id`

The trigger automatically detects which path to use:
```sql
SELECT COALESCE(
  (SELECT user_id FROM projects WHERE id = NEW.project_id),
  (SELECT user_id FROM video_jobs WHERE generation_id = NEW.id)
) INTO v_user_id;
```

## Credit Calculation

**Formula**: `1 credit = 1 second of video`

**Tier Rates** (for display/pricing, but credits are always 1:1 with seconds):
- Free: 0 credits (3 free generations with watermark)
- Open Mic: $0.35/second
- Indie Artist: $0.30/second
- Artist: $0.25/second
- Label: $0.15/second
- Demo: Up to 20 seconds (capped)
- Industry: Up to 90 seconds (capped)

**Note**: The actual credit deduction is always `cost_credits = duration_seconds`, regardless of tier. Tier rates are for pricing display only.

## Database Schema

### New Columns

**`generations` table**:
- `credits_deducted` (BOOLEAN, NOT NULL DEFAULT false) - Flag to prevent double-charging
- `credits_deducted_at` (TIMESTAMPTZ) - Timestamp when credits were deducted

### Indexes

- `idx_generations_credits_deducted` - For efficient lookups of undeducted generations

## Flow Diagram

```
1. User Creates Generation (Frontend)
   ↓
   INSERT INTO generations (status='pending', cost_credits=10, ...)
   ↓
2. Database Trigger Fires
   ↓
   on_generation_created_deduct_credits()
   ↓
   - Get user_id (from projects or video_jobs)
   - Call deduct_credits(user_id, cost_credits)
   - Set credits_deducted = true
   - Log to audit_log
   ↓
3. Worker Loop Processes Job
   ↓
   - Check if credits_deducted = false
   - If false, call retry_credit_deduction()
   - Continue processing
   ↓
4. Generation Completes
   ↓
   - Update status = 'completed'
   - Credits already deducted (no action needed)
```

## Error Handling

### Insufficient Credits

If `deduct_credits()` returns `false` (insufficient balance):
- Generation is still created (status='pending')
- `credits_deducted` remains `false`
- Transaction logged as `credits_deduction_failed` in `audit_log`
- Worker loop will retry when processing (may still fail if insufficient)

### Trigger Failure

If the trigger fails:
- Generation is still created
- `credits_deducted` remains `false`
- Worker loop safeguard will catch it and retry
- Manual retry function available as backup

### Double-Charging Prevention

The `credits_deducted` flag ensures:
- Trigger checks flag before deducting
- Retry function checks flag before deducting
- Multiple retries are safe (idempotent)

## Monitoring & Debugging

### Check Undeducted Generations

```sql
SELECT id, cost_credits, status, credits_deducted, created_at
FROM generations
WHERE credits_deducted = false
  AND cost_credits > 0
  AND status != 'cancelled'
ORDER BY created_at DESC;
```

### View Credit Transactions

```sql
SELECT 
  user_id,
  action,
  resource_id as generation_id,
  metadata->>'credits_deducted' as credits,
  metadata->>'credits_before' as before,
  metadata->>'credits_after' as after,
  created_at
FROM audit_log
WHERE action IN ('credits_deducted', 'credits_deduction_failed')
ORDER BY created_at DESC
LIMIT 100;
```

### Manual Retry for Specific Generation

```sql
SELECT retry_credit_deduction('generation-uuid-here');
```

## Migration

**Run this migration**:
```sql
\i packages/database/deduct-credits-on-generation-created.sql
```

**Before running**:
- Ensure `deduct_credits()` function exists
- Ensure `log_user_action()` function exists
- Ensure `audit_log` table exists

**After running**:
- Old trigger (`trg_generation_completed_deduct_credits`) is dropped
- New trigger (`trg_generation_created_deduct_credits`) is created
- Existing generations with `credits_deducted = false` can be retried manually

## Testing

1. **Create generation**: Credits should be deducted immediately
2. **Check audit_log**: Should see `credits_deducted` entry
3. **Check user balance**: Should be reduced by `cost_credits`
4. **Retry on same generation**: Should be idempotent (no double-charge)
5. **Insufficient credits**: Should log `credits_deduction_failed`, generation still created

## UI Updates

- Changed text from "will be deducted on completion" to "(deducted)"
- Users see credits are deducted immediately when request is created
