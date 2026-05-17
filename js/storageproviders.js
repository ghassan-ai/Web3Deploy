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

    // (Removed Arweave and ICP adapters)

    // ============================================
    // getAdapter — returns normalised adapter by ID
    // ============================================

    function getAdapter(providerId) {
        return pinataAdapter;
    }

    // ============================================
    // getProvider — returns PROVIDERS metadata
    // ============================================

    function getProvider(providerId) {
        return PROVIDERS[providerId] || null;
    }

    // (Removed uploadArweave and uploadICP helpers)

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
        ensureTrailingSlash: ensureTrailingSlash
    };

})();
