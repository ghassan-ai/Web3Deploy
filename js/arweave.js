// ============================================
// Web3Deploy — ArweaveProvider
// Permanent file storage on Arweave natively
// ============================================

var ArweaveProvider = (function () {
    'use strict';

    // ── Constants ────────────────────────────────
    var AR_GATEWAY   = 'https://arweave.net/';
    var LS_FILES     = 'web3deploy_files';
    var LS_JWK       = 'web3deploy_arweave_jwk';
    var MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

    // ── Internal state ──────────────────────────
    var _arweave = null;

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

    // ============================================
    // Init & JWK
    // ============================================

    function _getArweave() {
        if (_arweave) return _arweave;
        if (typeof Arweave === 'undefined') {
            throw new Error('Arweave SDK not loaded. Check dashboard.html script tags.');
        }
        _arweave = Arweave.init({
            host: 'arweave.net',
            port: 443,
            protocol: 'https'
        });
        return _arweave;
    }

    function _getJwk() {
        var raw = localStorage.getItem(LS_JWK);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // Public API
    // ============================================

    /**
     * upload(file) — Full upload flow natively via Arweave
     *   Returns { success, url, txId, error }
     */
    async function upload(file) {
        if (file.size > MAX_FILE_BYTES) {
            return { success: false, url: null, txId: null, error: 'File exceeds 100 MB limit.' };
        }

        var jwkKey = _getJwk();
        if (!jwkKey) {
            return { success: false, url: null, txId: null, error: 'Arweave JWK wallet not found in settings.' };
        }

        try {
            var arweave = _getArweave();

            // Read file data into ArrayBuffer
            var fileData = await file.arrayBuffer();

            // Create Transaction
            var tx = await arweave.createTransaction({ data: fileData }, jwkKey);
            
            // Add tags
            tx.addTag('Content-Type', file.type || 'application/octet-stream');
            tx.addTag('App-Name', 'Web3Deploy');
            tx.addTag('File-Name', file.name);

            // Sign
            await arweave.transactions.sign(tx, jwkKey);

            // Post
            var response = await arweave.transactions.post(tx);
            
            if (response.status >= 400) {
                var msg = 'Upload failed with status ' + response.status + ' ' + response.statusText;
                if (response.status === 402) {
                    msg = 'Insufficient AR balance in wallet.';
                }
                throw new Error(msg);
            }

            var txId = tx.id;
            var url  = AR_GATEWAY + txId;

            // Save to localStorage
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
            var msg = err.message || 'Upload failed. Please try again.';
            if (msg.indexOf('wallet') !== -1 || msg.indexOf('Insufficient') !== -1) {
                // Keep the msg as is
            } else {
                msg = 'Arweave Error: ' + msg;
            }
            return { success: false, url: null, txId: null, error: msg };
        }
    }

    function init() {
        if (typeof Arweave === 'undefined') {
            console.warn('ArweaveProvider: Arweave native JS not found yet.');
        } else {
            console.info('ArweaveProvider: ready (native).');
        }
    }

    // ============================================
    // Public API Surface
    // ============================================
    return {
        init:         init,
        upload:       upload,
        getFiles:     getFiles,
        GATEWAY_URL:  AR_GATEWAY,
        AR_GATEWAY:   AR_GATEWAY
    };

})();
