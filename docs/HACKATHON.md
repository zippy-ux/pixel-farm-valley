# Solana Hackathon — Pixel Farm Valley

Guide for running and deploying the Pixel Farm Valley frontend for hackathon demos.

## Prerequisites

- Node.js 18+
- pnpm (or npm)

## Setup

1. Clone the repo
2. `pnpm install`
3. Copy `.env.example` to `.env`
4. Add your `VITE_WALLETCONNECT_PROJECT_ID` (get one at [cloud.reown.com](https://cloud.reown.com))
5. `pnpm dev`

## API

The app connects to the **public Pixel Valley Farm API** at `https://pixelvalley.farm`. No backend setup required. You will need to log in (Twitter or email/password) — the live game handles authentication.

## Wallet Connect

Wallet features (connect, claim $PFV) require:

- `VITE_WALLETCONNECT_PROJECT_ID` in `.env`
- A Reown (WalletConnect) project — free at [cloud.reown.com](https://cloud.reown.com)

Without it, the app runs but wallet buttons will show a configuration message.

## Deploy

Static build. Deploy `dist/` to any static host:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages

```bash
pnpm build
# Upload dist/ contents
```

Set environment variables in your host's dashboard if needed (`VITE_API_URL`, `VITE_WALLETCONNECT_PROJECT_ID`).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank screen | Check browser console. Ensure `VITE_API_URL` points to a valid API. |
| Wallet connect fails | Set `VITE_WALLETCONNECT_PROJECT_ID`. |
| CORS errors | The API allows the origin. For custom domains, ensure the API CORS config includes your domain. |

## Pre-submission checklist

Before submitting to judges:

- [ ] No real keys in the repo (including git history — use `git log -p` to verify)
- [ ] `pnpm install && pnpm dev` starts without errors
- [ ] `pnpm build:landing` produces a build where LAUNCH button redirects to pixelvalley.farm

## Links

- [Live game](https://pixelvalley.farm)
- [Reown AppKit docs](https://docs.reown.com/appkit/javascript/core/options)
- [Solana docs](https://docs.solana.com)
