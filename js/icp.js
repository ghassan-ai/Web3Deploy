// ============================================
// Web3Deploy — ICPProvider
// Upload files to ICP asset canisters
// Auth via Internet Identity
// ============================================

var ICPProvider = (function () {
    'use strict';

    // ── Constants ────────────────────────────────
    var II_URL = 'https://identity.ic0.app';
    var IC_HOST = 'https://ic0.app';
    var LS_CANISTER = 'web3deploy_icp_canister_id';
    var LS_PRINCIPAL = 'web3deploy_icp_principal';
    var LS_FILES = 'web3deploy_files';
    var MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
    var CANISTER_REGEX = /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$/;

    // ── Internal state ──────────────────────────
    var _authClient = null;
    var _identity = null;
    var _agent = null;
    var _canisterId = null;

    // ============================================
    // Helpers
    // ============================================

    function getFiles() {
        try {
            var raw = localStorage.getItem(LS_FILES);
            var all = raw ? JSON.parse(raw) : [];
            return all.filter(function (f) { return f.provider === 'icp'; });
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
            console.warn('ICPProvider: failed to save file record', e);
        }
    }

    /**
     * sanitizeFileName — make a filename safe for canister keys.
     * Replace spaces with "-", strip non-safe chars, lowercase.
     */
    function sanitizeFileName(name) {
        return String(name)
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9._-]/g, '')
            .toLowerCase();
    }

    // ============================================
    // DFINITY SDK access
    // ============================================

    /**
     * Get the AuthClient constructor from the CDN-loaded global.
     * @dfinity/auth-client UMD bundle exposes via window.ic.AuthClient
     */
    function _getAuthClientClass() {
        // Primary: window.ic namespace (UMD CDN bundle)
        if (typeof window.ic !== 'undefined' && window.ic.AuthClient) {
            return window.ic.AuthClient;
        }
        // Fallback: bare global
        if (typeof window.AuthClient !== 'undefined') {
            return window.AuthClient;
        }
        throw new Error(
            'DFINITY AuthClient not loaded. ' +
            'Ensure @dfinity/auth-client CDN script is in dashboard.html.'
        );
    }

    /**
     * Get HttpAgent constructor.
     */
    function _getHttpAgentClass() {
        if (typeof window.ic !== 'undefined' && window.ic.HttpAgent) {
            return window.ic.HttpAgent;
        }
        if (typeof window.HttpAgent !== 'undefined') {
            return window.HttpAgent;
        }
        throw new Error(
            'DFINITY HttpAgent not loaded. ' +
            'Ensure @dfinity/agent CDN script is in dashboard.html.'
        );
    }



    // ============================================
    // Auth — Internet Identity
    // ============================================

    /**
     * _ensureAuthClient — create or reuse the AuthClient singleton.
     */
    async function _ensureAuthClient() {
        if (_authClient) return _authClient;
        var AuthClient = _getAuthClientClass();
        _authClient = await AuthClient.create();
        return _authClient;
    }

    /**
     * login() — Open Internet Identity popup.
     * Resolves when user completes auth. Rejects if popup closed / error.
     */
    async function login() {
        var client = await _ensureAuthClient();

        return new Promise(function (resolve, reject) {
            client.login({
                identityProvider: II_URL,
                maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1e9), // 7 days
                onSuccess: function () {
                    _identity = client.getIdentity();
                    _agent = null; // force rebuild with new identity

                    // Persist principal for display
                    try {
                        var principal = _identity.getPrincipal().toText();
                        localStorage.setItem(LS_PRINCIPAL, principal);
                    } catch (e) { /* non-critical */ }

                    resolve(_identity);
                },
                onError: function (err) {
                    reject(new Error(err || 'Login cancelled.'));
                }
            });
        });
    }

    /**
     * logout() — Clear identity, principal, canister ID.
     */
    async function logout() {
        if (_authClient) {
            await _authClient.logout();
        }
        _authClient = null;
        _identity = null;
        _agent = null;
        localStorage.removeItem(LS_PRINCIPAL);
        localStorage.removeItem(LS_CANISTER);
        _canisterId = null;
    }

    /**
     * isAuthenticated() — Return true if a valid II session exists.
     */
    async function isAuthenticated() {
        try {
            var client = await _ensureAuthClient();
            return await client.isAuthenticated();
        } catch (e) {
            return false;
        }
    }

    // ============================================
    // Canister ID management
    // ============================================

    /**
     * setCanisterId(id) — Validate format and persist.
     * Returns true if valid, throws if invalid.
     */
    function setCanisterId(id) {
        var trimmed = String(id).trim().toLowerCase();
        if (!CANISTER_REGEX.test(trimmed)) {
            throw new Error('Invalid canister ID format.');
        }
        _canisterId = trimmed;
        localStorage.setItem(LS_CANISTER, trimmed);
        return true;
    }

    /**
     * getCanisterId() — Return saved canister ID or null.
     */
    function getCanisterId() {
        if (_canisterId) return _canisterId;
        _canisterId = localStorage.getItem(LS_CANISTER) || null;
        return _canisterId;
    }

    // ============================================
    // HttpAgent factory
    // ============================================

    async function _buildAgent(identity) {
        if (_agent) return _agent;

        var HttpAgent = _getHttpAgentClass();
        _agent = new HttpAgent({
            identity: identity,
            host: IC_HOST
        });

        // Do NOT call fetchRootKey() in production (ic0.app is mainnet).
        // Uncomment only for local dfx testing:
        // await _agent.fetchRootKey();

        return _agent;
    }

    // ============================================
    // Upload
    // ============================================

    /**
     * upload(file) — Full upload flow:
     *   1. Validate size
     *   2. Resolve canister ID
     *   3. Ensure authenticated
     *   4. Build agent
     *   5. Upload via AssetManager or raw canister call
     *   6. Save to localStorage
     *   Returns { success, url, canisterId, error }
     */
    async function upload(file) {
        // ── 1. Validate size ──────────────────────
        if (file.size > MAX_FILE_BYTES) {
            return {
                success: false,
                url: null,
                canisterId: null,
                error: 'File exceeds 100 MB limit.'
            };
        }

        // ── 2. Resolve canister ID ────────────────
        var cId = getCanisterId();
        if (!cId) {
            return {
                success: false,
                url: null,
                canisterId: null,
                error: 'No canister ID set. Add it in settings.'
            };
        }

        try {
            // ── 3. Ensure authenticated ───────────
            var authed = await isAuthenticated();
            if (!authed) {
                await login();
                authed = await isAuthenticated();
                if (!authed) {
                    return {
                        success: false,
                        url: null,
                        canisterId: cId,
                        error: 'Authentication required.'
                    };
                }
            }

            // Get identity from the existing client
            _identity = _authClient.getIdentity();

            var safeName = sanitizeFileName(file.name);
            var fileUrl = 'https://' + cId + '.icp0.io/' + safeName;

            // ── 6. Upload via raw HTTP PUT ────────
            // ICP asset canisters accept direct HTTP PUT at their
            // raw.icp0.io endpoint. This avoids needing Actor/IDL/candid
            // which are not reliably available from browser CDN bundles.
            var putUrl = 'https://' + cId + '.raw.icp0.io/' + safeName;

            console.log('ICPProvider: uploading to', putUrl);

            var response = await fetch(putUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type || 'application/octet-stream'
                },
                body: file
            });

            if (!response.ok) {
                var statusText = response.statusText || ('HTTP ' + response.status);
                throw new Error(
                    'ICP upload failed (' + statusText + '). ' +
                    'Verify canister ID and that your identity has write access.'
                );
            }

            // ── 7. Save to localStorage ───────────
            saveFile({
                name: file.name,
                url: fileUrl,
                size: file.size,
                date: new Date().toISOString(),
                provider: 'icp',
                canisterId: cId
            });

            return {
                success: true,
                url: fileUrl,
                canisterId: cId,
                error: null
            };

        } catch (err) {
            // ── Error mapping ─────────────────────
            var msg = 'Upload failed. Please try again.';

            if (err && err.message) {
                var m = err.message;
                if (m === 'Login cancelled.' ||
                    m.indexOf('cancelled') !== -1 ||
                    m.indexOf('closed') !== -1) {
                    msg = 'Login cancelled.';
                } else if (m.indexOf('Invalid canister') !== -1 ||
                    m.indexOf('not found') !== -1 ||
                    m.indexOf('canister_not_found') !== -1) {
                    msg = 'Canister not found. Check the ID and try again.';
                } else if (m.indexOf('rejected') !== -1 ||
                    m.indexOf('permission') !== -1 ||
                    m.indexOf('unauthorized') !== -1) {
                    msg = 'Upload rejected. Check canister permissions.';
                } else if (m.indexOf('network') !== -1 ||
                    m.indexOf('fetch') !== -1 ||
                    m.indexOf('Failed to fetch') !== -1) {
                    msg = 'Network error. Please try again.';
                } else if (m.indexOf('not loaded') !== -1 ||
                    m.indexOf('not available') !== -1) {
                    msg = m; // already user-friendly
                }
            }

            return {
                success: false,
                url: null,
                canisterId: cId || null,
                error: msg
            };
        }
    }

    // ============================================
    // init()
    // ============================================

    /**
     * init() — Called by app.js on load.
     * Restores saved canister ID and silently restores II session if available.
     */
    function init() {
        _canisterId = localStorage.getItem(LS_CANISTER) || null;

        // Try to silently restore an existing Internet Identity session
        try {
            var AuthClientClass = _getAuthClientClass();
            AuthClientClass.create().then(function (client) {
                _authClient = client;
                client.isAuthenticated().then(function (authed) {
                    if (authed) {
                        _identity = client.getIdentity();
                        console.info('ICPProvider: restored Internet Identity session.');
                    }
                });
            }).catch(function () { /* not critical */ });
        } catch (e) {
            // DFINITY SDK not loaded yet — will warn on first use
            console.info('ICPProvider: DFINITY SDK not available — provider will be limited.');
        }
    }

    // ============================================
    // Public API Surface
    // ============================================
    return {
        init: init,
        login: login,
        logout: logout,
        isAuthenticated: isAuthenticated,
        setCanisterId: setCanisterId,
        getCanisterId: getCanisterId,
        upload: upload,
        getFiles: getFiles
    };

})();
