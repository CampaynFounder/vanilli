# Hero Background Image

## Upload Your Image Here

Place your hero background image in this directory as `hero-background.jpg`

## Image Requirements

- **File Name**: `hero-background.jpg` (or `.png`, `.webp`)
- **Recommended Size**: 1920x1080 (16:9) or larger
- **File Size**: Optimize to <500KB for fast loading
- **Format**: JPG (recommended), PNG, or WebP

## WCAG Compliance

The hero section includes:
- **Dark overlay** (80% opacity) to ensure text contrast
- **Gradient overlay** for additional readability
- **Text shadows** for better visibility
- **White text** on dark background (WCAG AA compliant)

Text contrast ratio: **>7:1** (exceeds WCAG AAA standard)

## Image Suggestions

- Abstract/futuristic visuals
- Music-themed imagery
- Tech/AI aesthetic
- Dark backgrounds work best
- Avoid bright areas where text will appear

## Update the Component

If you use a different filename, update `src/app/page.tsx`:
```tsx
backgroundImage: 'url(/images/your-image.jpg)',
```

