// ============================================
// Web3Deploy — Storage Provider Registry
// Central metadata + adapter factory for all
// five supported providers.
// ============================================

var StorageProviders = (function () {
    'use strict';

    // ============================================
    // Provider Metadata Registry
    // ============================================

    var PROVIDERS = {
        pinata: {
            name:        'Pinata',
            icon:        '📌',
            type:        'ipfs',
            gateway:     'https://gateway.pinata.cloud/ipfs/',
            description: 'IPFS storage via Pinata. Fast, reliable.',
            docsUrl:     'https://docs.pinata.cloud',
            setupFields: [
                { key: 'web3deploy_pinata_jwt', label: 'Pinata JWT Token', type: 'password', placeholder: 'eyJ...' }
            ]
        },
        arweave: {
            name:        'Arweave',
            icon:        '🌿',
            type:        'permanent',
            gateway:     'https://arweave.net/',
            description: 'Permanent storage on Arweave. Pay once in ETH via MetaMask.',
            docsUrl:     'https://docs.bundlr.network',
            setupFields: [] // No API key — uses MetaMask
        },
        icp: {
            name:        'ICP',
            icon:        '∞',
            type:        'canister',
            gateway:     'https://{canisterId}.icp0.io/',
            description: 'Store files on Internet Computer asset canister.',
            docsUrl:     'https://internetcomputer.org/docs',
            setupFields: [
                { key: 'web3deploy_icp_canister_id', label: 'Canister ID', type: 'text',
                  placeholder: 'xxxxx-xxxxx-xxxxx-xxxxx-xxx' }
            ]
        }
    };

    // ============================================
    // Adapter Builder
    // ============================================

    function fallbackFormatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + sizes[i];
    }

    function unsupported(providerName, feature) {
        var msg = providerName + ' does not support ' + feature + '.';
        return Promise.reject({ type: 'unsupported', message: msg });
    }

    function ensureTrailingSlash(url) {
        if (!url) return '';
        return url.charAt(url.length - 1) === '/' ? url : url + '/';
    }

    function buildAdapter(id, config) {
        return {
            id:          id,
            name:        config.name || id,
            gatewayUrl:  ensureTrailingSlash(config.gatewayUrl || ''),
            formatBytes: config.formatBytes || fallbackFormatBytes,
            uploadJSON:  config.uploadJSON  || null,
            listPins:    config.listPins    || null,
            unpin:       config.unpin       || null,
            unpinBulk:   config.unpinBulk   || null,
            getUsage:    config.getUsage    || null
        };
    }

    // ============================================
    // Pinata Adapter
    // ============================================

    var pinataAdapter = buildAdapter('pinata', {
        name:       'Pinata',
        gatewayUrl: typeof PinataAPI !== 'undefined' ? PinataAPI.GATEWAY_URL : 'https://gateway.pinata.cloud/ipfs/',
        formatBytes: typeof PinataAPI !== 'undefined' ? PinataAPI.formatBytes : fallbackFormatBytes,

        uploadJSON: function (jsonData, fileName, apiKey) {
            if (typeof PinataAPI === 'undefined' || !PinataAPI.uploadJSON) {
                return unsupported('Pinata', 'upload JSON');
            }
            return PinataAPI.uploadJSON(jsonData, fileName, apiKey);
        },

        listPins: function (options) {
            if (typeof PinataAPI === 'undefined' || !PinataAPI.listPins) {
                return unsupported('Pinata', 'list pins');
            }
            return PinataAPI.listPins(options);
        },

        unpin: function (cid, apiKey) {
            if (typeof PinataAPI === 'undefined' || !PinataAPI.unpin) {
                return unsupported('Pinata', 'unpin');
            }
            return PinataAPI.unpin(cid, apiKey);
        },

        unpinBulk: function (cids, apiKey) {
            if (typeof PinataAPI === 'undefined' || !PinataAPI.unpinBulk) {
                return unsupported('Pinata', 'bulk unpin');
            }
            return PinataAPI.unpinBulk(cids, apiKey);
        },

        getUsage: function (apiKey) {
            if (typeof PinataAPI === 'undefined' || !PinataAPI.getUsage) {
                return unsupported('Pinata', 'usage');
            }
            return PinataAPI.getUsage(apiKey);
        }
    });

    // ============================================
    // Arweave/Irys Adapter
    // ============================================

    var arweaveAdapter = buildAdapter('arweave', {
        name:       'Arweave',
        gatewayUrl: 'https://arweave.net/'
    });

    // ============================================
    // ICP Adapter
    // ============================================

    var icpAdapter = buildAdapter('icp', {
        name:       'ICP',
        gatewayUrl: 'https://icp0.io/'
    });

    // ============================================
    // getAdapter — returns normalised adapter by ID
    // ============================================

    function getAdapter(providerId) {
        switch (providerId) {
            case 'arweave':    return arweaveAdapter;
            case 'icp':        return icpAdapter;
            default:           return pinataAdapter;
        }
    }

    // ============================================
    // getProvider — returns PROVIDERS metadata
    // ============================================

    function getProvider(providerId) {
        return PROVIDERS[providerId] || null;
    }

    // ============================================
    // uploadArweave — convenience helper
    // ============================================

    async function uploadArweave(file) {
        if (typeof ArweaveProvider !== 'undefined' && ArweaveProvider.upload) {
            var result = await ArweaveProvider.upload(file);
            if (!result.success) throw new Error(result.error || 'Arweave upload failed.');
            return { txId: result.txId, url: result.url };
        }
        throw new Error('ArweaveProvider not loaded. Check that js/arweave.js is included.');
    }

    // ============================================
    // uploadICP — convenience helper
    // ============================================

    async function uploadICP(file, canisterId) {
        if (typeof ICPProvider === 'undefined') {
            throw new Error('ICPProvider not loaded. Check that js/icp.js is included.');
        }
        var result = await ICPProvider.upload(file, canisterId);
        if (!result.success) throw new Error(result.error || 'ICP upload failed.');
        return { url: result.url };
    }

    // ============================================
    // unpinBulk — shared bulk-unpin with fallback
    // ============================================

    function unpinBulk(adapter, cids, apiKey) {
        if (adapter && adapter.unpinBulk) {
            return adapter.unpinBulk(cids, apiKey);
        }
        if (!adapter || !adapter.unpin) {
            return Promise.reject({ type: 'unsupported', message: 'Bulk unpin not available.' });
        }
        var results = { success: [], failed: [] };
        var chain   = Promise.resolve();
        cids.forEach(function (cid) {
            chain = chain.then(function () {
                return adapter.unpin(cid, apiKey).then(function () {
                    results.success.push(cid);
                }).catch(function (err) {
                    results.failed.push({ cid: cid, error: err && err.message ? err.message : 'Unknown' });
                });
            });
        });
        return chain.then(function () { return results; });
    }

    // ============================================
    // Public API
    // ============================================
    return {
        PROVIDERS:           PROVIDERS,
        getAdapter:          getAdapter,
        getProvider:         getProvider,
        unpinBulk:           unpinBulk,
        ensureTrailingSlash: ensureTrailingSlash,
        uploadArweave:       uploadArweave,
        uploadICP:           uploadICP
    };

})();
