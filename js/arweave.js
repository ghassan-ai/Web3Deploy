// ============================================
// Web3Deploy — ArweaveProvider
// Permanent file storage on Arweave via Irys
// Paid in ETH through MetaMask
// ============================================

var ArweaveProvider = (function () {
    'use strict';

    // ── Constants ────────────────────────────────
    var IRYS_NODE    = 'https://node2.irys.xyz';
    var IRYS_GATEWAY = 'https://gateway.irys.xyz/';
    var AR_GATEWAY   = 'https://arweave.net/';
    var LS_FILES     = 'web3deploy_files';
    var MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

    // ── Internal state ──────────────────────────
    var _irys  = null;
    var _ready = false;

    // ============================================
    // Helpers
    // ============================================

    function getFiles() {
        try {
            var raw = localStorage.getItem(LS_FILES);
            var all = raw ? JSON.parse(raw) : [];
            return all.filter(function (f) { return f.provider === 'arweave'; });
        } catch (e) {
            return [];
        }
    }

    function saveFile(entry) {
        try {
            var raw = localStorage.getItem(LS_FILES);
            var all = raw ? JSON.parse(raw) : [];
            all.unshift(entry);
            localStorage.setItem(LS_FILES, JSON.stringify(all));
        } catch (e) {
            console.warn('ArweaveProvider: failed to save file record', e);
        }
    }

    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Convert atomic (wei-style) bigint to a short ETH string.
     * Works with BigInt, BN.js, or plain string inputs.
     */
    function formatEth(atomicValue) {
        var str = String(atomicValue);
        // Remove any non-digit characters (e.g. "0x" or "n")
        str = str.replace(/[^0-9]/g, '');
        if (!str) return '0';

        // Pad to at least 19 digits so we can split at 18
        while (str.length <= 18) str = '0' + str;
        var intPart  = str.slice(0, str.length - 18) || '0';
        var fracPart = str.slice(str.length - 18).replace(/0+$/, '');
        if (!fracPart) return intPart;
        return intPart + '.' + fracPart.slice(0, 8);
    }

    // ============================================
    // Confirmation Modal (pure JS)
    // ============================================

    function showCostModal(costEth, fileName) {
        return new Promise(function (resolve, reject) {
            // Clean up any stale modal
            var existing = document.getElementById('arweaveCostModal');
            if (existing) existing.remove();

            var overlay = document.createElement('div');
            overlay.id = 'arweaveCostModal';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:9999',
                'background:rgba(0,0,0,0.75)',
                'display:flex;align-items:center;justify-content:center',
                'backdrop-filter:blur(4px)'
            ].join(';');

            overlay.innerHTML =
                '<div style="background:#12121a;border:1px solid #00ff8833;border-radius:16px;' +
                'padding:32px 28px;max-width:420px;width:90%;box-shadow:0 0 40px #00ff8815;text-align:center">' +
                    '<div style="font-size:2.2rem;margin-bottom:12px">🌿</div>' +
                    '<h3 style="color:#e8e8f0;margin:0 0 8px;font-size:1.15rem">' +
                        'Permanent Upload' +
                    '</h3>' +
                    '<p style="color:#8888aa;font-size:.88rem;margin:0 0 18px;line-height:1.6">' +
                        'Uploading <strong style="color:#e8e8f0">' + _escHtml(fileName) + '</strong><br>' +
                        'will cost approximately<br>' +
                        '<span style="font-size:1.3rem;font-weight:700;color:#00ffaa;font-family:monospace">' +
                            _escHtml(costEth) + ' ETH' +
                        '</span><br>' +
                        '<span style="color:#555570;font-size:.78rem">This is permanent — stored on Arweave forever.</span>' +
                    '</p>' +
                    '<div style="display:flex;gap:12px">' +
                        '<button id="arweaveCostCancel" style="flex:1;padding:12px;border-radius:8px;' +
                            'border:1px solid #333355;background:transparent;color:#8888aa;cursor:pointer;font-size:.9rem">' +
                            'Cancel</button>' +
                        '<button id="arweaveCostConfirm" style="flex:1;padding:12px;border-radius:8px;' +
                            'border:none;background:linear-gradient(135deg,#00cc88,#00ff88);' +
                            'color:#0a0a0f;font-weight:700;cursor:pointer;font-size:.9rem">' +
                            'Confirm & Pay</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            document.getElementById('arweaveCostConfirm').addEventListener('click', function () {
                _closeCostModal();
                resolve(true);
            });

            document.getElementById('arweaveCostCancel').addEventListener('click', function () {
                _closeCostModal();
                reject(new Error('Upload cancelled.'));
            });
        });
    }

    function _closeCostModal() {
        var m = document.getElementById('arweaveCostModal');
        if (m) m.remove();
    }

    // ============================================
    // Irys initialisation (lazy, one-shot)
    // ============================================

    async function _getIrys() {
        if (_irys && _ready) return _irys;

        // Require MetaMask
        if (typeof window.ethereum === 'undefined') {
            throw new Error('MetaMask not found. Please install MetaMask to use Arweave storage.');
        }

        try {
            // Debug: log the actual shape of window.WebIrys so we can see
            // which export key the esm.sh bundle provides.
            console.log('WebIrys shape:', Object.keys(window.WebIrys || {}));

            var mod = window.WebIrys;
            var Ctor = mod?.WebIrys 
                    || mod?.WebUploader 
                    || mod?.default?.WebIrys
                    || mod?.default?.WebUploader
                    || mod?.default
                    || mod;

            if (typeof Ctor !== 'function') {
                console.error('WebIrys shape:', Object.keys(mod || {}));
                throw new Error('WebIrys constructor not found');
            }

            console.log('Using Irys constructor:', Ctor.name || 'anonymous');

            var irysInstance = new Ctor({
                url:   IRYS_NODE,
                token: 'ethereum',
                wallet: { provider: window.ethereum }
            });

            await irysInstance.ready();
            _irys  = irysInstance;
            _ready = true;
            return _irys;

        } catch (err) {
            console.error('_getIrys failed:', err.message, err.stack);
            throw err;
        }
    }

    // ============================================
    // Public API
    // ============================================

    /**
     * init() — Called by app.js on load.
     * Checks MetaMask and verifies Irys SDK availability after a delay.
     */
    function init() {
        if (typeof window.ethereum === 'undefined') {
            console.info('ArweaveProvider: MetaMask not available — provider disabled.');
        } else {
            console.info('ArweaveProvider: ready (MetaMask detected).');
        }

        // WebIrys is loaded via an ESM shim (type="module") so it resolves
        // asynchronously. Log a warning if it hasn't appeared after 3 s.
        setTimeout(function () {
            if (typeof window.WebIrys === 'undefined' &&
                typeof window.IrysWebUpload === 'undefined' &&
                typeof window.Irys === 'undefined') {
                console.error(
                    'ArweaveProvider WARNING: window.WebIrys is still undefined after 3 s. ' +
                    'Arweave uploads will fail. Check dashboard.html script order.'
                );
            }
        }, 3000);
    }

    /**
     * getBalance() — Return Irys node balance in ETH string.
     */
    async function getBalance() {
        var irys = await _getIrys();
        var atomicBalance = await irys.getLoadedBalance();
        return formatEth(atomicBalance);
    }

    /**
     * estimateCost(bytes) — Return estimated upload cost in ETH string.
     */
    async function estimateCost(bytes) {
        var irys = await _getIrys();
        var atomicPrice = await irys.getPrice(bytes);
        return formatEth(atomicPrice);
    }

    /**
     * fund(ethAmount) — Fund Irys node wallet with ETH.
     * ethAmount: string or number, e.g. "0.01"
     */
    async function fund(ethAmount) {
        var irys   = await _getIrys();
        var atomic = irys.utils.toAtomic(String(ethAmount));
        return irys.fund(atomic);
    }

    /**
     * upload(file) — Full upload flow:
     *   1. Validate file size
     *   2. Check wallet connection
     *   3. Init WebIrys
     *   4. Estimate cost → show confirmation modal
     *   5. Fund if balance insufficient
     *   6. Upload with tags
     *   7. Save to localStorage
     *   Returns { success, url, txId, error }
     */
    async function upload(file) {
        // ── 1. Validate size ──────────────────────
        if (file.size > MAX_FILE_BYTES) {
            return {
                success: false,
                url:     null,
                txId:    null,
                error:   'File exceeds 100 MB limit.'
            };
        }

        // ── 2. Check wallet ───────────────────────
        if (typeof WalletAuth !== 'undefined' && !WalletAuth.isConnected()) {
            return {
                success: false,
                url:     null,
                txId:    null,
                error:   'Connect your wallet first.'
            };
        }

        try {
            // ── 3. Initialise Irys ────────────────
            var irys = await _getIrys();

            // ── 4. Estimate cost ──────────────────
            var atomicPrice = await irys.getPrice(file.size);
            var costEthStr  = formatEth(atomicPrice);

            // ── 5. Confirm with user ──────────────
            await showCostModal(costEthStr, file.name);

            // ── 6. Fund if balance insufficient ───
            var balance = await irys.getLoadedBalance();
            if (BigInt(balance.toString()) < BigInt(atomicPrice.toString())) {
                // Fund cost + 10 % buffer
                var needed = BigInt(atomicPrice.toString()) +
                             BigInt(atomicPrice.toString()) / BigInt(10);
                await irys.fund(needed.toString());
            }

            // ── 7. Upload with tags ───────────────
            var tags = [
                { name: 'Content-Type', value: file.type || 'application/octet-stream' },
                { name: 'App-Name',     value: 'Web3Deploy' },
                { name: 'File-Name',    value: file.name }
            ];

            var receipt = await irys.uploadFile(file, { tags: tags });
            var txId    = receipt.id;
            var url     = IRYS_GATEWAY + txId;

            // ── 8. Save to localStorage ───────────
            saveFile({
                name:      file.name,
                txId:      txId,
                url:       url,
                arUrl:     AR_GATEWAY + txId,
                size:      file.size,
                date:      new Date().toISOString(),
                provider:  'arweave',
                permanent: true
            });

            return { success: true, url: url, txId: txId, error: null };

        } catch (err) {
            // ── Error mapping ─────────────────────
            var msg = 'Upload failed. Please try again.';

            if (err && err.message) {
                var m = err.message;
                if (m === 'Upload cancelled.') {
                    msg = 'Upload cancelled.';
                } else if (err.code === 4001 ||
                           m.indexOf('User rejected') !== -1 ||
                           m.indexOf('user rejected') !== -1 ||
                           m.indexOf('4001') !== -1) {
                    msg = 'Upload cancelled.';
                } else if (m.indexOf('insufficient') !== -1 ||
                           m.indexOf('balance') !== -1) {
                    msg = 'Insufficient ETH. Fund your Irys wallet first.';
                } else if (m.indexOf('network') !== -1 ||
                           m.indexOf('fetch') !== -1 ||
                           m.indexOf('Failed to fetch') !== -1) {
                    msg = 'Network error. Please try again.';
                } else if (m.indexOf('MetaMask') !== -1 ||
                           m.indexOf('not loaded') !== -1 ||
                           m.indexOf('not found') !== -1) {
                    msg = m; // already user-friendly
                }
            } else if (err && err.code === 4001) {
                msg = 'Upload cancelled.';
            }

            return { success: false, url: null, txId: null, error: msg };
        }
    }

    // ============================================
    // Public API Surface
    // ============================================
    return {
        init:         init,
        getBalance:   getBalance,
        estimateCost: estimateCost,
        fund:         fund,
        upload:       upload,
        getFiles:     getFiles,
        GATEWAY_URL:  IRYS_GATEWAY,
        AR_GATEWAY:   AR_GATEWAY
    };

})();
