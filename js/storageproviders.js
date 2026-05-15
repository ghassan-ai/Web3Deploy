// ============================================
// Web3Deploy -- Storage Provider Adapter
// Normalizes provider-specific APIs for pins
// ============================================

var StorageProviders = (function () {
    'use strict';

    function fallbackFormatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + sizes[i];
    }

    function unsupported(providerName, feature) {
        var msg = providerName + ' API not configured for ' + feature + '.';
        return Promise.reject({ type: 'unsupported', message: msg });
    }

    function ensureTrailingSlash(url) {
        if (!url) return '';
        return url.charAt(url.length - 1) === '/' ? url : url + '/';
    }

    function buildAdapter(id, config) {
        return {
            id: id,
            name: config.name || id,
            gatewayUrl: ensureTrailingSlash(config.gatewayUrl || ''),
            formatBytes: config.formatBytes || fallbackFormatBytes,
            uploadJSON: config.uploadJSON || function () { return unsupported(config.name || id, 'upload JSON'); },
            listPins: config.listPins || function () { return unsupported(config.name || id, 'list pins'); },
            unpin: config.unpin || function () { return unsupported(config.name || id, 'unpin'); },
            unpinBulk: config.unpinBulk || null,
            getUsage: config.getUsage || function () { return unsupported(config.name || id, 'usage'); }
        };
    }

    var pinataAdapter = buildAdapter('pinata', {
        name: 'Pinata',
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

    var filebaseAdapter = buildAdapter('filebase', {
        name: 'Filebase',
        gatewayUrl: 'https://ipfs.filebase.io/ipfs/'
    });

    var lighthouseAdapter = buildAdapter('lighthouse', {
        name: 'Lighthouse',
        gatewayUrl: 'https://gateway.lighthouse.storage/ipfs/'
    });

    var arweaveAdapter = buildAdapter('arweave', {
        name: 'Arweave',
        gatewayUrl: 'https://arweave.net/'
    });

    async function uploadArweave(file) {
        var walletStr = localStorage.getItem('arweave_wallet');
        if (!walletStr) throw new Error('Arweave wallet not found');
        var wallet = JSON.parse(walletStr);

        var arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
        
        var arrayBuffer = await file.arrayBuffer();
        var fileBytes = new Uint8Array(arrayBuffer);
        
        var tx = await arweave.createTransaction({ data: fileBytes });
        tx.addTag('Content-Type', file.type || 'application/octet-stream');
        
        await arweave.transactions.sign(tx, wallet);
        await arweave.transactions.post(tx);
        
        return { txId: tx.id, url: 'https://arweave.net/' + tx.id };
    }

    function getAdapter(providerId) {
        if (providerId === 'filebase') return filebaseAdapter;
        if (providerId === 'lighthouse') return lighthouseAdapter;
        if (providerId === 'arweave') return arweaveAdapter;
        return pinataAdapter;
    }

    function unpinBulk(adapter, cids, apiKey) {
        if (adapter && adapter.unpinBulk) {
            return adapter.unpinBulk(cids, apiKey);
        }
        if (!adapter || !adapter.unpin) {
            return Promise.reject({ type: 'unsupported', message: 'Bulk unpin not available.' });
        }
        var results = { success: [], failed: [] };
        var chain = Promise.resolve();
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

    return {
        getAdapter: getAdapter,
        unpinBulk: unpinBulk,
        ensureTrailingSlash: ensureTrailingSlash,
        uploadArweave: uploadArweave
    };
})();
