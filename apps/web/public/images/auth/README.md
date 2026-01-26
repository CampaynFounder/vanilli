# Auth background images

Images shown **behind the sign-in and sign-up forms** (and the signup modal) with a dark overlay for legibility.

## Where to put your image(s)

| File            | Purpose                          |
|-----------------|----------------------------------|
| `auth-bg-1.jpg` | Main background (required for now) |
| `auth-bg-2.jpg` | Optional; when present, one of the two is chosen at random |

- Use **JPG or PNG** (e.g. `auth-bg-1.png`).  
- If you use a different name or format, update the path in `src/lib/auth-background.ts`.

## Enabling a second image (alternating)

1. Add `auth-bg-2.jpg` (or `.png`) to this folder.
2. In `src/lib/auth-background.ts`, add it to the `AUTH_BG_IMAGES` array:
   ```ts
   export const AUTH_BG_IMAGES = ['/images/auth/auth-bg-1.jpg', '/images/auth/auth-bg-2.jpg'] as const;
   ```
   The app will randomly pick one of them when the auth screen is shown.

## Tips

- Use a **9:16 or 16:9** (or similar) image so it crops nicely with `background-size: cover`.
- Avoid very bright or busy areas where the form sits; the overlay keeps text readable but a calmer image works best.
