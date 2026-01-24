# Vannilli - Music Video AI Platform

**Project Code: Sync-Stage**

Democratizing high-end music video production by allowing artists to pay for bars, not compute.

## Mission

Transform the music video production industry by wrapping enterprise-grade AI in a musician-friendly interface that converts musical terms (BPM, Bars, Measures) into professional music videos.

## Core Value Proposition

- **The Musician's Interface**: Artists enter BPM and bars, not technical parameters
- **Identity Transfer**: Upload your performance + AI art = Final music video
- **Transparent Pricing**: Pay per bar of music, not per second of compute

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Progressive Web App
- **Backend**: Cloudflare Workers (Edge Functions)
- **Storage**: Cloudflare R2
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe
- **Video AI**: Kling v2.6 Motion Control API
- **CI/CD**: GitHub Actions + Cloudflare Pages

## Repository Structure

```
vannilli/
├── docs/              # Architecture and technical documentation
├── apps/
│   ├── web/          # Next.js frontend application
│   └── workers/      # Cloudflare Workers backend
├── packages/
│   ├── database/     # Supabase schema and migrations
│   ├── kling-adapter/# Video provider interface
│   └── music-calculator/ # BPM to seconds conversion logic
├── .github/
│   └── workflows/    # CI/CD pipelines
└── legal/            # Terms of Service and Privacy Policy
```

## Getting Started

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design and setup instructions.

## Development Timeline

- **Weeks 1-2**: Foundation (Architecture, Database, CI/CD)
- **Weeks 3-5**: Core Engine (Backend APIs, Payment Integration)
- **Weeks 6-8**: User Experience (Frontend PWA, Recording Flow)
- **Weeks 9-10**: Compliance & Growth (Legal, Viral Features)
- **Weeks 11-12**: Polish & Launch

## License

Proprietary - All rights reserved


