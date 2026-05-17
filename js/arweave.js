// ============================================
// Web3Deploy — ArweaveProvider
// Permanent file storage on Arweave via Bundlr
// Paid in ETH through MetaMask
// ============================================

var ArweaveProvider = (function () {
    'use strict';

    // ── Constants ────────────────────────────────
    var BUNDLR_NODE  = 'https://node2.bundlr.network';
    var AR_GATEWAY   = 'https://arweave.net/';
    var LS_FILES     = 'web3deploy_files';
    var MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

    // ── Internal state ──────────────────────────
    var _bundlr = null;
    var _ready  = false;

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
     */
    function formatEth(atomicValue) {
        var str = String(atomicValue);
        str = str.replace(/[^0-9]/g, '');
        if (!str) return '0';

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
    // Bundlr initialisation (lazy)
    // ============================================

    async function _getBundlr() {
        if (_bundlr && _ready) return _bundlr;

        if (typeof window.ethereum === 'undefined') {
            throw new Error('MetaMask not found. Please install MetaMask to use Arweave storage.');
        }

        if (typeof window.WebBundlr === 'undefined') {
            throw new Error('Bundlr SDK not loaded. Check dashboard.html script tags.');
        }

        try {
            var bundlrInstance = new window.WebBundlr(BUNDLR_NODE, 'ethereum', window.ethereum);
            await bundlrInstance.ready();
            _bundlr = bundlrInstance;
            _ready  = true;
            return _bundlr;
        } catch (err) {
            console.error('_getBundlr failed:', err);
            throw err;
        }
    }

    // ============================================
    // Public API
    // ============================================

    function init() {
        if (typeof window.ethereum === 'undefined') {
            console.info('ArweaveProvider: MetaMask not available — provider disabled.');
        } else {
            console.info('ArweaveProvider: ready (MetaMask detected).');
        }

        setTimeout(function () {
            if (typeof window.WebBundlr === 'undefined') {
                console.error('ArweaveProvider WARNING: window.WebBundlr is undefined. Arweave uploads will fail.');
            }
        }, 3000);
    }

    async function getBalance() {
        var bundlr = await _getBundlr();
        var atomicBalance = await bundlr.getLoadedBalance();
        return formatEth(atomicBalance);
    }

    async function estimateCost(bytes) {
        var bundlr = await _getBundlr();
        var atomicPrice = await bundlr.getPrice(bytes);
        return formatEth(atomicPrice);
    }

    async function fund(ethAmount) {
        var bundlr = await _getBundlr();
        var atomic = bundlr.utils.toAtomic(String(ethAmount));
        return bundlr.fund(atomic);
    }

    async function upload(file) {
        if (file.size > MAX_FILE_BYTES) {
            return { success: false, url: null, txId: null, error: 'File exceeds 100 MB limit.' };
        }

        if (typeof WalletAuth !== 'undefined' && !WalletAuth.isConnected()) {
            return { success: false, url: null, txId: null, error: 'Connect your wallet first.' };
        }

        try {
            var bundlr = await _getBundlr();

            var atomicPrice = await bundlr.getPrice(file.size);
            var costEthStr  = formatEth(atomicPrice);

            await showCostModal(costEthStr, file.name);

            var balance = await bundlr.getLoadedBalance();
            if (BigInt(balance.toString()) < BigInt(atomicPrice.toString())) {
                var needed = BigInt(atomicPrice.toString()) + BigInt(atomicPrice.toString()) / BigInt(10);
                await bundlr.fund(needed.toString());
            }

            var tags = [
                { name: 'Content-Type', value: file.type || 'application/octet-stream' },
                { name: 'App-Name',     value: 'Web3Deploy' },
                { name: 'File-Name',    value: file.name }
            ];

            var fileBuffer = await file.arrayBuffer();
            // Bundlr web requires a Buffer or Uint8Array. arrayBuffer usually works or we can pass Uint8Array.
            var tx = await bundlr.upload(new Uint8Array(fileBuffer), { tags: tags });

            var txId = tx.id;
            var url  = AR_GATEWAY + txId;

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
            var msg = 'Upload failed. Please try again.';

            if (err && err.message) {
                var m = err.message;
                if (m === 'Upload cancelled.') {
                    msg = 'Upload cancelled.';
                } else if (err.code === 4001 || m.indexOf('rejected') !== -1 || m.indexOf('4001') !== -1) {
                    msg = 'Upload cancelled.';
                } else if (m.indexOf('insufficient') !== -1 || m.indexOf('balance') !== -1) {
                    msg = 'Insufficient ETH. Fund your wallet first.';
                } else if (m.indexOf('network') !== -1 || m.indexOf('fetch') !== -1) {
                    msg = 'Network error. Please try again.';
                } else if (m.indexOf('MetaMask') !== -1 || m.indexOf('not loaded') !== -1) {
                    msg = m;
                } else {
                    msg = 'Bundlr Error: ' + m;
                }
            }

            return { success: false, url: null, txId: null, error: msg };
        }
    }

    return {
        init:         init,
        getBalance:   getBalance,
        estimateCost: estimateCost,
        fund:         fund,
        upload:       upload,
        getFiles:     getFiles,
        GATEWAY_URL:  AR_GATEWAY,
        AR_GATEWAY:   AR_GATEWAY
    };

})();
