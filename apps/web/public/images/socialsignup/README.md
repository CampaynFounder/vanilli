# Social Signup Page Assets

Place images here for the `/socialsignup` page.

## Hero headline (replaces “Get Your AI Artist Signed” text)

- **File:** `hero-headline.png`
- **Path:** `public/images/socialsignup/hero-headline.png`
- **Usage:** Shown instead of the H1, with a **gradual reveal** (fade-in + slight slide-up over ~1s). Use a PNG with transparent or dark background; ~800×200px or similar aspect works well on mobile. If the file is missing, the page falls back to the text headline.

## Company / label logos (carousel)

- **Folder:** `public/images/socialsignup/logos/`
- **Files:** `logo-1.png`, `logo-2.png`, … `logo-7.png`
- **Usage:** Shown in a **horizontal scrolling** carousel inside **transparent containers** (subtle `border-white/10` border only). PNG with transparency recommended; roughly square, e.g. 120×120px to 200×200px. Missing logos show a small “Logo” placeholder until you add the file.

## Summary

```
public/images/socialsignup/
├── README.md           (this file)
├── hero-headline.png   ← upload your “Get Your AI Artist Signed” graphic
└── logos/
    ├── logo-1.png      ← company/label logo 1
    ├── logo-2.png
    ├── …
    └── logo-7.png
```
