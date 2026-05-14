# Web3Deploy — Project Brief

## What is this project?
A frontend-only Web3 file storage gateway.
Users can upload files/websites to IPFS via Pinata, Filebase, or Lighthouse.
No backend, no server — everything runs in the browser.

## Tech Stack
- Pure HTML, CSS, Vanilla JavaScript ONLY
- No frameworks (no React, Vue, etc.)
- No npm, no build tools
- Hosted on GitHub Pages

## File Structure
- index.html → Landing page
- dashboard.html → Main app (upload, file manager, domain manager)
- css/style.css → All styles
- js/app.js → Main logic and auth
- js/pinata.js → Pinata API integration
- js/filebase.js → Filebase API integration
- js/wallet.js → MetaMask wallet authentication

## Design Rules
- Dark theme only, background: #0a0a0f
- Accent color: green (#00ff88) or blue (#0066ff)
- Fully responsive (mobile + tablet + desktop)
- Web3 aesthetic

## Security Rules
- API Keys saved in localStorage ONLY
- Never log or send API keys anywhere
- No external CSS/JS libraries

## Current Progress
- [x] Phase 1: Project structure created
- [x] Phase 2: Landing page
- [x] Phase 3: Auth system
- [x] Phase 4: Upload system
- [x] Phase 5: File manager
- [x] Phase 6: Domain manager
- [x] Phase 7: تسجيل الدخول بالمحفظة
- [x] Phase 8: حفظ الملفات على IPFS
- [x] Phase 9: حفظ الدومينات على IPFS