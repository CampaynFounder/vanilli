# Launch Configuration Guide

## How to Update the Launch Date

### Option 1: Environment Variable (Recommended for Production)

Add to your `.env.local` or production environment:

```bash
NEXT_PUBLIC_LAUNCH_DATE=2025-03-15T12:00:00
NEXT_PUBLIC_SHOW_COUNTDOWN=true
```

### Option 2: Edit Config File

Edit `/apps/web/src/config/launch.ts`:

```typescript
export const LAUNCH_CONFIG = {
  LAUNCH_DATE: '2025-03-15T12:00:00', // Your launch date
  SHOW_COUNTDOWN: true, // Set to false to hide timer
};
```

## Date Format

Use ISO 8601 format: `YYYY-MM-DDTHH:mm:ss`

Examples:
- `2025-03-15T12:00:00` - March 15, 2025 at 12:00 PM
- `2025-06-01T00:00:00` - June 1, 2025 at midnight
- `2025-12-25T18:30:00` - December 25, 2025 at 6:30 PM

## After Launch

To remove the countdown timer after launch:

1. Set `SHOW_COUNTDOWN: false` in the config file, OR
2. Set `NEXT_PUBLIC_SHOW_COUNTDOWN=false` in environment variables

The form will still collect emails, but without the countdown timer.

## Testing

- The countdown updates every second
- When the launch date passes, the timer automatically hides
- The form continues to work for email collection


