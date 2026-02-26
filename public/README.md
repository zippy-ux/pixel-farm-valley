# Public assets

- **Favicon:** Put `favicon.png` (or `favicon.ico`) in this folder. It will be served at `/favicon.png` (or `/favicon.ico`). The app uses `/favicon.png` in `index.html`; change the `<link rel="icon">` href if you use `.ico`.
- **Logo:** Put `logo.png` in this folder to have it served at `/logo.png` (e.g. for sharing or direct links). The deploy script copies both `favicon.png` and `logo.png` from `dist/` to the server.
- **Game assets** (characters, locations, UI icons) live under `assets/`.

## Landing (main login screen) — background and icons

- **Background:** Put the background image in **`apps/web/src/assets/landing/landing-bg.png`**. It's imported and bundled at build time.
- **Social icons (SVG):** Place in **`apps/web/src/assets/landing/`** with names:
  - `icon-twitter.svg` — X (Twitter)
  - `icon-telegram.svg` — Telegram
  - `icon-gitbook.svg` — GitBook  
  Replace these SVG files to use your own — icons render white on the green button background.
