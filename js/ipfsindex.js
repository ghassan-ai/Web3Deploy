// ============================================
// Web3Deploy — IPFS Index Persistence
// Maintains an index.json on IPFS that tracks
// all uploaded files per wallet address.
// ============================================

var IpfsIndex = (function () {
    'use strict';

    var INDEX_PREFIX = 'web3deploy_';
    var INDEX_SUFFIX = '_index';
    var SYNC_SUFFIX = '_lastsync';
    var DEFAULT_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

    function getAdapter(providerId) {
        if (typeof StorageProviders !== 'undefined' && StorageProviders.getAdapter) {
            return StorageProviders.getAdapter(providerId);
        }
        return null;
    }

    function getGatewayBase(providerId, override) {
        var base = override;
        if (!base) {
            var adapter = getAdapter(providerId);
            base = adapter && adapter.gatewayUrl ? adapter.gatewayUrl : DEFAULT_GATEWAY;
        }
        if (typeof StorageProviders !== 'undefined' && StorageProviders.ensureTrailingSlash) {
            return StorageProviders.ensureTrailingSlash(base);
        }
        return base && base.charAt(base.length - 1) === '/' ? base : base + '/';
    }

    // ============================================
    // localStorage helpers
    // ============================================

    function getIndexKey(walletAddr) {
        if (!walletAddr) return null;
        return INDEX_PREFIX + walletAddr.toLowerCase() + INDEX_SUFFIX;
    }

    function getSyncKey(walletAddr) {
        if (!walletAddr) return null;
        return INDEX_PREFIX + walletAddr.toLowerCase() + SYNC_SUFFIX;
    }

    function getIndexCid(walletAddr) {
        var key = getIndexKey(walletAddr);
        if (!key) return null;
        return localStorage.getItem(key) || null;
    }

    function touchSync(walletAddr) {
        var syncKey = getSyncKey(walletAddr);
        if (!syncKey) return;
        localStorage.setItem(syncKey, new Date().toISOString());
    }

    function saveIndexCid(walletAddr, cid) {
        var key = getIndexKey(walletAddr);
        if (!key) return;
        localStorage.setItem(key, cid);
        touchSync(walletAddr);
    }

    function getLastSynced(walletAddr) {
        var syncKey = getSyncKey(walletAddr);
        if (!syncKey) return null;
        var iso = localStorage.getItem(syncKey);
        if (!iso) return null;
        return new Date(iso);
    }

    function getLastSyncedText(walletAddr) {
        var last = getLastSynced(walletAddr);
        if (!last) return '';
        var now = Date.now();
        var diff = now - last.getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Last synced: just now';
        if (mins < 60) return 'Last synced: ' + mins + ' minute' + (mins !== 1 ? 's' : '') + ' ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return 'Last synced: ' + hrs + ' hour' + (hrs !== 1 ? 's' : '') + ' ago';
        var days = Math.floor(hrs / 24);
        return 'Last synced: ' + days + ' day' + (days !== 1 ? 's' : '') + ' ago';
    }

    // ============================================
    // Fetch index.json from IPFS
    // ============================================

    async function fetchIndex(cid, gatewayBase) {
        if (!cid) return [];

        try {
            var url = getGatewayBase(null, gatewayBase) + cid;
            var res = await fetch(url, { cache: 'no-store' });

            if (!res.ok) {
                console.warn('[IpfsIndex] Failed to fetch index.json, HTTP', res.status);
                return [];
            }

            var data = await res.json();

            // Support both formats: raw array or { version, files, updatedAt }
            if (Array.isArray(data)) {
                return data;
            }
            if (data && Array.isArray(data.files)) {
                return data.files;
            }

            console.warn('[IpfsIndex] Unexpected index format:', data);
            return [];
        } catch (err) {
            console.warn('[IpfsIndex] Error fetching index:', err);
            return [];
        }
    }

    // ============================================
    // Upload index.json to Pinata
    // ============================================

    async function uploadIndex(files, providerId, apiKey) {
        var indexData = {
            version: 1,
            files: files,
            updatedAt: new Date().toISOString()
        };

        var adapter = getAdapter(providerId);
        if (adapter && adapter.uploadJSON) {
            return await adapter.uploadJSON(indexData, 'web3deploy-index.json', apiKey);
        }

        throw new Error('No provider adapter available for index upload.');
    }

    // ============================================
    // Add a file to the index
    // ============================================

    async function addFile(fileInfo, providerId, apiKey, walletAddr) {
        if (!walletAddr || !apiKey) {
            console.warn('[IpfsIndex] Cannot persist: no wallet or API key');
            return null;
        }

        try {
            // 1. Get existing index
            var oldCid = getIndexCid(walletAddr);
            var files = await fetchIndex(oldCid, getGatewayBase(providerId));

            // 2. Check for duplicate CID — update if exists, add if not
            var existingIdx = -1;
            for (var i = 0; i < files.length; i++) {
                if (files[i].cid === fileInfo.cid) {
                    existingIdx = i;
                    break;
                }
            }

            if (existingIdx !== -1) {
                files[existingIdx] = fileInfo;
            } else {
                files.push(fileInfo);
            }

            // 3. Upload new index
            var result = await uploadIndex(files, providerId, apiKey);

            // 4. Save new CID
            saveIndexCid(walletAddr, result.cid);

            // 5. Unpin old index (cleanup)
            if (oldCid && oldCid !== result.cid) {
                unpinOldIndex(oldCid, providerId, apiKey);
            }

            console.log('%c📋 Index updated: ' + files.length + ' files, CID: ' + result.cid, 'color: #00ff88;');
            return result;
        } catch (err) {
            console.warn('[IpfsIndex] Failed to persist file:', err);
            return null;
        }
    }

    // ============================================
    // Remove a file from the index
    // ============================================

    async function removeFile(cid, providerId, apiKey, walletAddr) {
        if (!walletAddr || !apiKey) return null;

        try {
            var oldCid = getIndexCid(walletAddr);
            var files = await fetchIndex(oldCid, getGatewayBase(providerId));

            var newFiles = files.filter(function (f) {
                return f.cid !== cid;
            });

            // Nothing changed
            if (newFiles.length === files.length) return null;

            var result = await uploadIndex(newFiles, providerId, apiKey);
            saveIndexCid(walletAddr, result.cid);

            // Cleanup old index
            if (oldCid && oldCid !== result.cid) {
                unpinOldIndex(oldCid, providerId, apiKey);
            }

            console.log('%c📋 File removed from index, ' + newFiles.length + ' remaining', 'color: #00ff88;');
            return result;
        } catch (err) {
            console.warn('[IpfsIndex] Failed to remove file from index:', err);
            return null;
        }
    }

    // ============================================
    // Get all files from the index
    // ============================================

    async function ensureIndexCid(providerId, apiKey, walletAddr) {
        if (!walletAddr) return null;

        var cid = getIndexCid(walletAddr);
        if (cid) return cid;

        if (!apiKey) return null;
        var adapter = getAdapter(providerId);
        if (!adapter || !adapter.listPins) return null;

        try {
            var result = await adapter.listPins({
                apiKey: apiKey,
                search: 'web3deploy-index.json',
                sort: 'DESC',
                limit: 10
            });
            var pins = (result && result.pins) ? result.pins : [];
            var match = pins.find(function (p) { return p.name === 'web3deploy-index.json'; }) || pins[0];
            if (match && match.cid) {
                saveIndexCid(walletAddr, match.cid);
                return match.cid;
            }
        } catch (err) {
            console.warn('[IpfsIndex] Index discovery failed:', err);
        }

        return null;
    }

    async function syncFiles(options) {
        var walletAddr = options && options.walletAddr;
        var providerId = options && options.providerId;
        var apiKey = options && options.apiKey;

        var cid = await ensureIndexCid(providerId, apiKey, walletAddr);
        if (!cid) return { files: [], cid: null };

        var files = await fetchIndex(cid, getGatewayBase(providerId));
        touchSync(walletAddr);
        return { files: files, cid: cid };
    }

    async function getFiles(walletAddr, providerId) {
        var cid = getIndexCid(walletAddr);
        if (!cid) return [];

        var files = await fetchIndex(cid, getGatewayBase(providerId));
        touchSync(walletAddr);
        return files;
    }

    // ============================================
    // Unpin old index (fire-and-forget)
    // ============================================

    function unpinOldIndex(cid, providerId, apiKey) {
        if (!cid || !apiKey) return;

        var adapter = getAdapter(providerId);
        if (!adapter || !adapter.unpin) return;

        adapter.unpin(cid, apiKey).then(function () {
            console.log('[IpfsIndex] Old index unpinned:', cid);
        }).catch(function () {
            // Silent fail — old index cleanup is non-critical
        });
    }

    // ============================================
    // Public API
    // ============================================

    return {
        addFile: addFile,
        removeFile: removeFile,
        getFiles: getFiles,
        getIndexCid: getIndexCid,
        getLastSynced: getLastSynced,
        getLastSyncedText: getLastSyncedText,
        fetchIndex: fetchIndex,
        ensureIndexCid: ensureIndexCid,
        syncFiles: syncFiles
    };

})();
