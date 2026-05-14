// ============================================
// Web3Deploy -- Domains Index Persistence
// Maintains a domains.json on IPFS per wallet
// ============================================

var DomainsIndex = (function () {
    'use strict';

    var INDEX_PREFIX = 'web3deploy_';
    var INDEX_SUFFIX = '_domains';
    var SYNC_SUFFIX = '_domains_lastsync';
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

    function getDomainsKey(walletAddr) {
        if (!walletAddr) return null;
        return INDEX_PREFIX + walletAddr.toLowerCase() + INDEX_SUFFIX;
    }

    function getSyncKey(walletAddr) {
        if (!walletAddr) return null;
        return INDEX_PREFIX + walletAddr.toLowerCase() + SYNC_SUFFIX;
    }

    function getDomainsCid(walletAddr) {
        var key = getDomainsKey(walletAddr);
        if (!key) return null;
        return localStorage.getItem(key) || null;
    }

    function touchSync(walletAddr) {
        var syncKey = getSyncKey(walletAddr);
        if (!syncKey) return;
        localStorage.setItem(syncKey, new Date().toISOString());
    }

    function saveDomainsCid(walletAddr, cid) {
        var key = getDomainsKey(walletAddr);
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
    // Fetch domains.json from IPFS
    // ============================================

    async function fetchDomains(cid, gatewayBase) {
        if (!cid) return [];

        try {
            var url = getGatewayBase(null, gatewayBase) + cid;
            var res = await fetch(url, { cache: 'no-store' });

            if (!res.ok) {
                console.warn('[DomainsIndex] Failed to fetch domains.json, HTTP', res.status);
                return [];
            }

            var data = await res.json();

            if (Array.isArray(data)) {
                return data;
            }
            if (data && Array.isArray(data.domains)) {
                return data.domains;
            }

            console.warn('[DomainsIndex] Unexpected domains format:', data);
            return [];
        } catch (err) {
            console.warn('[DomainsIndex] Error fetching domains:', err);
            return [];
        }
    }

    // ============================================
    // Upload domains.json to provider
    // ============================================

    async function uploadDomains(domains, providerId, apiKey) {
        var payload = {
            version: 1,
            domains: domains,
            updatedAt: new Date().toISOString()
        };

        var adapter = getAdapter(providerId);
        if (adapter && adapter.uploadJSON) {
            return await adapter.uploadJSON(payload, 'web3deploy-domains.json', apiKey);
        }

        throw new Error('No provider adapter available for domains upload.');
    }

    // ============================================
    // Add or update a domain
    // ============================================

    async function addDomain(domainInfo, providerId, apiKey, walletAddr) {
        if (!walletAddr || !apiKey) {
            console.warn('[DomainsIndex] Cannot persist: no wallet or API key');
            return null;
        }

        try {
            var oldCid = getDomainsCid(walletAddr);
            var domains = await fetchDomains(oldCid, getGatewayBase(providerId));

            var target = domainInfo.domain ? domainInfo.domain.toLowerCase() : '';
            var existingIdx = -1;
            for (var i = 0; i < domains.length; i++) {
                if ((domains[i].domain || '').toLowerCase() === target) {
                    existingIdx = i;
                    break;
                }
            }

            if (existingIdx !== -1) {
                domains[existingIdx] = domainInfo;
            } else {
                domains.push(domainInfo);
            }

            var result = await uploadDomains(domains, providerId, apiKey);
            saveDomainsCid(walletAddr, result.cid);

            if (oldCid && oldCid !== result.cid) {
                unpinOldIndex(oldCid, providerId, apiKey);
            }

            console.log('[DomainsIndex] Domains updated:', domains.length, 'CID:', result.cid);
            return result;
        } catch (err) {
            console.warn('[DomainsIndex] Failed to persist domain:', err);
            return null;
        }
    }

    // ============================================
    // Remove a domain
    // ============================================

    async function removeDomain(domainName, providerId, apiKey, walletAddr) {
        if (!walletAddr || !apiKey) return null;

        try {
            var oldCid = getDomainsCid(walletAddr);
            var domains = await fetchDomains(oldCid, getGatewayBase(providerId));
            var target = domainName ? domainName.toLowerCase() : '';

            var newDomains = domains.filter(function (d) {
                return (d.domain || '').toLowerCase() !== target;
            });

            if (newDomains.length === domains.length) return null;

            var result = await uploadDomains(newDomains, providerId, apiKey);
            saveDomainsCid(walletAddr, result.cid);

            if (oldCid && oldCid !== result.cid) {
                unpinOldIndex(oldCid, providerId, apiKey);
            }

            console.log('[DomainsIndex] Domain removed. Remaining:', newDomains.length);
            return result;
        } catch (err) {
            console.warn('[DomainsIndex] Failed to remove domain:', err);
            return null;
        }
    }

    // ============================================
    // Ensure domains CID
    // ============================================

    async function ensureDomainsCid(providerId, apiKey, walletAddr) {
        if (!walletAddr) return null;

        var cid = getDomainsCid(walletAddr);
        if (cid) return cid;

        if (!apiKey) return null;
        var adapter = getAdapter(providerId);
        if (!adapter || !adapter.listPins) return null;

        try {
            var result = await adapter.listPins({
                apiKey: apiKey,
                search: 'web3deploy-domains.json',
                sort: 'DESC',
                limit: 10
            });
            var pins = (result && result.pins) ? result.pins : [];
            var match = pins.find(function (p) { return p.name === 'web3deploy-domains.json'; }) || pins[0];
            if (match && match.cid) {
                saveDomainsCid(walletAddr, match.cid);
                return match.cid;
            }
        } catch (err) {
            console.warn('[DomainsIndex] Domains discovery failed:', err);
        }

        return null;
    }

    // ============================================
    // Sync domains
    // ============================================

    async function syncDomains(options) {
        var walletAddr = options && options.walletAddr;
        var providerId = options && options.providerId;
        var apiKey = options && options.apiKey;

        var cid = await ensureDomainsCid(providerId, apiKey, walletAddr);
        if (!cid) return { domains: [], cid: null };

        var domains = await fetchDomains(cid, getGatewayBase(providerId));
        touchSync(walletAddr);
        return { domains: domains, cid: cid };
    }

    async function getDomains(walletAddr, providerId) {
        var cid = getDomainsCid(walletAddr);
        if (!cid) return [];

        var domains = await fetchDomains(cid, getGatewayBase(providerId));
        touchSync(walletAddr);
        return domains;
    }

    // ============================================
    // Unpin old index
    // ============================================

    function unpinOldIndex(cid, providerId, apiKey) {
        if (!cid || !apiKey) return;

        var adapter = getAdapter(providerId);
        if (!adapter || !adapter.unpin) return;

        adapter.unpin(cid, apiKey).then(function () {
            console.log('[DomainsIndex] Old domains index unpinned:', cid);
        }).catch(function () {
            // Silent fail
        });
    }

    // ============================================
    // Public API
    // ============================================

    return {
        addDomain: addDomain,
        removeDomain: removeDomain,
        getDomains: getDomains,
        getDomainsCid: getDomainsCid,
        getLastSyncedText: getLastSyncedText,
        fetchDomains: fetchDomains,
        ensureDomainsCid: ensureDomainsCid,
        syncDomains: syncDomains
    };
})();
