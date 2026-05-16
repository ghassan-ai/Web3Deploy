# Web3Deploy — Agent Brief (Full)

## What is this project?
A frontend-only Web3 file storage gateway.
Users upload files/websites to decentralized storage via Pinata, Filebase, Lighthouse, Arweave (via Irys), or ICP (Internet Computer).
No backend, no server, no npm, no build tools — everything runs in the browser.
Hosted on GitHub Pages.

---

## Tech Stack
- Pure HTML, CSS, Vanilla JavaScript ONLY
- No React, Vue, or any framework
- No npm, no build tools
- All external libraries loaded via CDN `<script>` tags
- Hosted on GitHub Pages

---

## File Structure & Responsibilities

```
index.html              → Landing page (public-facing)
dashboard.html          → Main app (upload, file manager, domain manager)
css/style.css           → All styles (dark theme, Web3 aesthetic)

js/app.js               → Main controller: initializes all modules, handles tab switching,
                          reads saved provider from localStorage, shows/hides setup screen
js/wallet.js            → MetaMask authentication (window.ethereum), sign message, auto-reconnect
js/storageproviders.js  → Provider registry: PROVIDERS object with metadata for all 5 providers
                          (Pinata, Filebase, Lighthouse, Arweave/Irys, ICP)
js/pinata.js            → Pinata IPFS upload via REST API (api.pinata.cloud)
js/filebase.js          → Filebase IPFS upload via S3-compatible API
js/ipfsindex.js         → Lighthouse IPFS upload via REST API
js/filemanager.js       → File list UI: reads uploaded files from localStorage, renders cards,
                          copy CID/URL, delete, preview
js/domainmanager.js     → ENS/DNS domain linking: generates TXT + _dnslink records for IPFS CIDs
js/domainsindex.js      → Domain list UI: renders saved domains from localStorage
```

---

## CDN Libraries Required in dashboard.html

```html
<!-- Ethers.js v6 — for MetaMask wallet -->
<script src="https://cdn.jsdelivr.net/npm/ethers@6.13.0/dist/ethers.umd.min.js"></script>

<!-- Arweave JS — for direct Arweave wallet uploads -->
<script src="https://unpkg.com/arweave/bundles/web.bundle.min.js"></script>

<!-- Irys (Bundlr) browser SDK — for Arweave uploads paid with ETH via MetaMask -->
<script src="https://unpkg.com/@irys/sdk/build/esm/index.js" type="module"></script>

<!-- DFINITY Agent JS — for ICP asset canister uploads -->
<script src="https://unpkg.com/@dfinity/agent@1.4.0/lib/cjs/index.js"></script>
<script src="https://unpkg.com/@dfinity/candid@1.4.0/lib/cjs/index.js"></script>
<script src="https://unpkg.com/@dfinity/principal@1.4.0/lib/cjs/index.js"></script>
```

---

## Provider Specifications

### 1. Pinata (IPFS)
- API endpoint: `https://api.pinata.cloud/pinning/pinFileToIPFS`
- Auth: Bearer token (JWT) or `pinata_api_key` + `pinata_secret_api_key` headers
- Upload: FormData with file
- Returns: `IpfsHash` → accessible via `https://gateway.pinata.cloud/ipfs/{IpfsHash}`
- localStorage key: `web3deploy_pinata_jwt`

### 2. Filebase (IPFS)
- API: S3-compatible endpoint `https://s3.filebase.com`
- Auth: Access Key + Secret Key
- Uses PUT request with AWS Signature v4 OR via simple fetch with basic auth
- Returns: custom `x-amz-meta-cid` header with the IPFS CID
- localStorage keys: `web3deploy_filebase_key`, `web3deploy_filebase_secret`, `web3deploy_filebase_bucket`

### 3. Lighthouse (IPFS)
- API endpoint: `https://node.lighthouse.storage/api/v0/add`
- Auth: `Authorization: Bearer {API_KEY}` header
- Upload: FormData with file
- Returns: `{ Hash, Name, Size }` → `https://gateway.lighthouse.storage/ipfs/{Hash}`
- localStorage key: `web3deploy_lighthouse_key`

### 4. Arweave via Irys (PERMANENT STORAGE)
- Irys endpoint: `https://node2.irys.xyz`
- Auth: MetaMask wallet (window.ethereum) — user pays in ETH, Irys bridges to AR
- Upload: `irys.uploadFile(file)` or `irys.upload(data, { tags })`
- Returns: transaction ID → accessible via `https://gateway.irys.xyz/{txId}`
  - Also accessible via: `https://arweave.net/{txId}`
- Price: ~$0.005 per MB (permanent, pay once, stored forever)
- No API key needed — uses MetaMask signature
- localStorage key: `web3deploy_arweave_txids` (array of uploaded tx IDs)
- Implementation:
  ```javascript
  // Initialize Irys with MetaMask
  const irys = new Irys({
    url: "https://node2.irys.xyz",
    token: "ethereum",
    wallet: { provider: window.ethereum, rpcUrl: "https://cloudflare-eth.com" }
  });
  await irys.ready();

  // Check balance and fund if needed
  const balance = await irys.getLoadedBalance();
  if (balance.lt(irys.utils.toAtomic(0.01))) {
    await irys.fund(irys.utils.toAtomic(0.01));
  }

  // Upload
  const receipt = await irys.uploadFile(file, {
    tags: [
      { name: "Content-Type", value: file.type },
      { name: "App-Name", value: "Web3Deploy" },
      { name: "File-Name", value: file.name }
    ]
  });
  // receipt.id = Arweave transaction ID
  ```

### 5. ICP — Internet Computer (ASSET CANISTER)
- Network: `https://ic0.app`
- Auth: Internet Identity (WebAuthn) via `@dfinity/auth-client`
- Canister: User must deploy their own asset canister (via dfx) and provide the Canister ID
- Upload flow:
  1. Authenticate with Internet Identity
  2. Create `HttpAgent` pointing to ic0.app
  3. Call `store()` method on asset canister with file bytes
  4. File accessible at: `https://{canisterId}.icp0.io/{filename}`
- localStorage keys: `web3deploy_icp_canister_id`, `web3deploy_icp_identity`
- Implementation:
  ```javascript
  import { HttpAgent } from "@dfinity/agent";
  import { AuthClient } from "@dfinity/auth-client";

  // Login with Internet Identity
  const authClient = await AuthClient.create();
  await authClient.login({
    identityProvider: "https://identity.ic0.app",
    onSuccess: async () => {
      const identity = authClient.getIdentity();
      const agent = new HttpAgent({ identity, host: "https://ic0.app" });
      // Call store() on asset canister
    }
  });
  ```
- Note: For frontend-only, use the pre-built `@dfinity/assets` package via CDN

---

## localStorage Keys (Full Map)

```
web3deploy_wallet          → Connected MetaMask address
web3deploy_provider        → Active provider: "pinata"|"filebase"|"lighthouse"|"arweave"|"icp"
web3deploy_pinata_jwt      → Pinata JWT token
web3deploy_filebase_key    → Filebase access key
web3deploy_filebase_secret → Filebase secret key
web3deploy_filebase_bucket → Filebase bucket name
web3deploy_lighthouse_key  → Lighthouse API key
web3deploy_icp_canister_id → ICP asset canister ID
web3deploy_files           → JSON array of uploaded files [{name, cid, url, size, date, provider}]
web3deploy_domains         → JSON array of linked domains [{domain, cid, provider, date}]
web3deploy_arweave_txids   → JSON array of Arweave tx IDs
```

---

## Security Rules
- API keys saved in localStorage ONLY — never sent to any external server except the intended provider
- Never log API keys to console
- All API calls go directly from browser to provider API (no proxy)
- Validate file size before upload (max 100MB per file)
- Sanitize file names before upload (remove special characters)
- Never expose API keys in error messages shown to user

---

## Agent Audit Tasks — PRIORITY ORDER

### TASK 1: Audit & Fix all JS files
Go through each file in `js/` and:
1. Find all broken function calls (functions referenced but not defined)
2. Find all missing event listeners (buttons with onclick that have no handler)
3. Find all localStorage keys that are inconsistent across files (use the map above)
4. Fix all async/await errors (missing try/catch, unhandled promise rejections)
5. Fix all CORS errors in API calls (wrong headers, wrong endpoints)
6. Make sure every upload function returns `{ success, url, cid/txId, provider, error }`

### TASK 2: Add Arweave/Irys Integration
Create or rewrite `js/arweave.js`:
- Export `ArweaveProvider` module (same pattern as pinata.js and filebase.js)
- Functions: `init()`, `upload(file)`, `getBalance()`, `fund(amount)`
- Show upload cost estimate before confirming
- After upload: save to `web3deploy_files` in localStorage
- Add to `storageproviders.js` PROVIDERS registry

### TASK 3: Add ICP Integration
Create `js/icp.js`:
- Export `ICPProvider` module
- Functions: `init()`, `login()`, `upload(file, canisterId)`, `logout()`
- Use Internet Identity for auth
- After upload: save to `web3deploy_files` in localStorage
- Add to `storageproviders.js` PROVIDERS registry

### TASK 4: Update storageproviders.js
The `PROVIDERS` object must include all 5:
```javascript
var PROVIDERS = {
  pinata:     { name: 'Pinata',     icon: '📌', type: 'ipfs',      gateway: 'https://gateway.pinata.cloud/ipfs/' },
  filebase:   { name: 'Filebase',   icon: '🗄️', type: 'ipfs',      gateway: 'https://ipfs.filebase.io/ipfs/' },
  lighthouse: { name: 'Lighthouse', icon: '🔦', type: 'ipfs',      gateway: 'https://gateway.lighthouse.storage/ipfs/' },
  arweave:    { name: 'Arweave',    icon: '🌿', type: 'permanent', gateway: 'https://gateway.irys.xyz/' },
  icp:        { name: 'ICP',        icon: '∞',  type: 'canister',  gateway: 'https://{canisterId}.icp0.io/' }
};
```

### TASK 5: Update domainmanager.js
- For Arweave: generate `_dnslink` TXT record pointing to `ar://{txId}`
- For ICP: generate CNAME record pointing to `{canisterId}.icp0.io`
- Currently only supports IPFS `_dnslink` — must be extended for all provider types

### TASK 6: Update filemanager.js
- Show provider badge on each file card (IPFS / Permanent / Canister)
- For Arweave files: show "Permanent ♾️" badge
- For ICP files: show "ICP ∞" badge
- Add "View on Explorer" link: Arweave → arweave.net, ICP → dashboard.internetcomputer.org

---

## Current Progress
- [x] Phase 1: Project structure created
- [x] Phase 2: Landing page
- [x] Phase 3: Auth system (MetaMask + API key)
- [x] Phase 4: Upload system (Pinata, Filebase, Lighthouse)
- [x] Phase 5: File manager
- [x] Phase 6: Domain manager
- [x] Phase 7: Wallet login (MetaMask sign message)
- [x] Phase 8: Save files to IPFS
- [x] Phase 9: Save domains to IPFS
- [x] Phase 10: Arweave permanent storage via Irys (MetaMask payment)
- [x] Phase 11: ICP asset canister upload via Internet Identity
- [x] Phase 12: File manager provider badges + explorer links (Arweave ♾️, ICP ∞)
- [x] Phase 13: Provider-aware domain manager (ar:// dnslink + ICP CNAME)

---

## Design Rules
- Dark theme only, background: #0a0a0f
- Accent color: green (#00ff88) or blue (#0066ff)
- Fully responsive (mobile + tablet + desktop)
- Web3 aesthetic — no flat/corporate look
- Never show raw error objects to user — always show friendly messages

---

## Agent Notes
- When fixing files, preserve the IIFE module pattern: `var Module = (function(){ ... })()`
- All modules must expose a `.init()` function called from `app.js`
- Never use ES6 `import/export` — use global `var` module pattern for browser compatibility
- Test each provider independently — one failing provider must NOT break others
- Console logs for debug are OK but must be removed before production commit
-