var FileManager = (function () {
    'use strict';
    var allPins = [], filteredPins = [], selectedCids = new Set();
    var indexFiles = [], indexCid = null;
    var currentView = localStorage.getItem('fm_view') || 'grid';
    var currentFilter = 'all', currentSort = 'newest', searchQuery = '';
    var getActiveKey = null, fmInitialized = false, unpinTarget = null;
    var compareMode = false, compareSelected = [];
    var providerAdapter = null, providerGateway = '';
    var syncInFlight = false;
    var els = {};
    function init(getKeyFn) {
        if (fmInitialized) return; fmInitialized = true; getActiveKey = getKeyFn;
        els = { storageText: document.getElementById('storageText'), storageFill: document.getElementById('storageFill'), storageWarning: document.getElementById('storageWarning'), closeStorageWarn: document.getElementById('closeStorageWarn'), fmSearch: document.getElementById('fmSearch'), fmSort: document.getElementById('fmSort'), fmSyncBtn: document.getElementById('fmSyncBtn'), fmSyncStatus: document.getElementById('fmSyncStatus'), fmGrid: document.getElementById('fmGrid'), fmListWrap: document.getElementById('fmListWrap'), fmListBody: document.getElementById('fmListBody'), fmLoading: document.getElementById('fmLoading'), fmEmpty: document.getElementById('fmEmpty'), fmNoResults: document.getElementById('fmNoResults'), fmBulkBar: document.getElementById('fmBulkBar'), fmBulkCount: document.getElementById('fmBulkCount'), fmSelectAll: document.getElementById('fmSelectAll'), fmSelectAllList: document.getElementById('fmSelectAllList'), fmGoUpload: document.getElementById('fmGoUpload'), versionOverlay: document.getElementById('versionOverlay'), versionPanel: document.getElementById('versionPanel'), versionList: document.getElementById('versionList'), vpSiteName: document.getElementById('vpSiteName'), vpStatus: document.getElementById('vpStatus'), closeVersionPanel: document.getElementById('closeVersionPanel'), vpCompareBtn: document.getElementById('vpCompareBtn'), vpCompareBar: document.getElementById('vpCompareBar'), vpCompareCount: document.getElementById('vpCompareCount'), vpCancelCompare: document.getElementById('vpCancelCompare'), unpinOverlay: document.getElementById('unpinOverlay'), unpinCid: document.getElementById('unpinCid'), confirmUnpin: document.getElementById('confirmUnpin'), cancelUnpin: document.getElementById('cancelUnpin'), bulkUnpinOverlay: document.getElementById('bulkUnpinOverlay'), bulkCount: document.getElementById('bulkCount'), bulkCount2: document.getElementById('bulkCount2'), confirmBulkUnpin: document.getElementById('confirmBulkUnpin'), cancelBulkUnpin: document.getElementById('cancelBulkUnpin'), rollbackOverlay: document.getElementById('rollbackOverlay'), rollbackCid: document.getElementById('rollbackCid'), confirmRollback: document.getElementById('confirmRollback'), cancelRollback: document.getElementById('cancelRollback'), compareOverlay: document.getElementById('compareOverlay'), compareVersionsRow: document.getElementById('compareVersionsRow'), compareStats: document.getElementById('compareStats'), closeCompare: document.getElementById('closeCompare') };
        bindEvents(); setView(currentView);
        if (typeof WalletAuth !== 'undefined' && WalletAuth.isConnected()) {
            updateSyncStatus(WalletAuth.getAddress());
        }
    }
    function resolveAdapter() {
        var key = getActiveKey && getActiveKey();
        if (!key) return null;
        if (typeof StorageProviders !== 'undefined' && StorageProviders.getAdapter) {
            providerAdapter = StorageProviders.getAdapter(key.provider);
        }
        if (!providerAdapter) providerAdapter = null;
        providerGateway = providerAdapter && providerAdapter.gatewayUrl ? providerAdapter.gatewayUrl : (typeof PinataAPI !== 'undefined' ? PinataAPI.GATEWAY_URL : '');
        return providerAdapter;
    }

    function fmt(b) {
        var adapter = providerAdapter || resolveAdapter();
        if (adapter && adapter.formatBytes) return adapter.formatBytes(b);
        if (typeof PinataAPI !== 'undefined' && PinataAPI.formatBytes) return PinataAPI.formatBytes(b);
        return String(b || 0);
    }
    function fmtDate(d) { if (!d) return '\u2014'; var dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    function typeFromName(n) { var ext = (n.split('.').pop() || '').toLowerCase(); if (['html', 'htm'].indexOf(ext) !== -1) return 'html'; if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].indexOf(ext) !== -1) return 'image'; if (['js', 'ts', 'mjs'].indexOf(ext) !== -1) return 'js'; if (['css', 'scss', 'less'].indexOf(ext) !== -1) return 'css'; return 'other'; }
    function typeForPin(pin) { if (pin && pin.type) return pin.type; return typeFromName(pin && pin.name ? pin.name : ''); }
    function iconFor(pinOrName) { var t = typeof pinOrName === 'string' ? typeFromName(pinOrName) : typeForPin(pinOrName); return t === 'html' ? '🌐' : t === 'image' ? '🖼️' : t === 'js' ? '⚙️' : t === 'css' ? '🎨' : '📄'; }
    function truncCid(c) { if (!c || c.length < 16) return c; return c.slice(0, 8) + '…' + c.slice(-6); }
    function gwUrl(pinOrCid) {
        var cid = typeof pinOrCid === 'string' ? pinOrCid : (pinOrCid && pinOrCid.cid ? pinOrCid.cid : '');
        var gateway = (pinOrCid && pinOrCid.gateway) ? pinOrCid.gateway : (providerGateway || '');
        if (!gateway) return cid;
        if (gateway.indexOf(cid) !== -1) return gateway;
        return gateway + cid;
    }
    function ipfsUrl(c) { return 'ipfs://' + c; }
    function copyText(text, btn) { navigator.clipboard.writeText(text).then(function () { var o = btn.textContent; btn.textContent = '✓'; setTimeout(function () { btn.textContent = o; }, 1200); }); }
    function findPinByCid(cid) { return allPins.find(function (p) { return p.cid === cid; }) || filteredPins.find(function (p) { return p.cid === cid; }) || null; }
    function updateSyncStatus(walletAddr, overrideText) {
        if (!els.fmSyncStatus) return;
        if (overrideText) {
            els.fmSyncStatus.textContent = overrideText;
            return;
        }
        if (walletAddr && typeof IpfsIndex !== 'undefined' && IpfsIndex.getLastSyncedText) {
            els.fmSyncStatus.textContent = IpfsIndex.getLastSyncedText(walletAddr);
        } else {
            els.fmSyncStatus.textContent = '';
        }
    }

    function setSyncing(isSyncing) {
        if (!els.fmSyncBtn) return;
        els.fmSyncBtn.disabled = isSyncing;
        els.fmSyncBtn.textContent = isSyncing ? 'Syncing...' : 'Sync Files';
    }

    function normalizeProviderPin(pin) {
        if (!pin || !pin.cid) return null;
        var name = pin.name || pin.cid;
        return {
            cid: pin.cid,
            name: name,
            size: pin.size || 0,
            date: pin.date || pin.date_pinned || '',
            type: pin.type || typeFromName(name),
            gateway: pin.gateway || (providerGateway ? providerGateway + pin.cid : ''),
            source: 'provider'
        };
    }

    function normalizeIndexFile(file) {
        if (!file || !file.cid) return null;
        var name = file.name || file.cid;
        return {
            cid: file.cid,
            name: name,
            size: file.size || 0,
            date: file.date || '',
            type: file.type || typeFromName(name),
            gateway: file.gateway || '',
            source: 'index'
        };
    }

    function mergePins(providerPins, indexEntries) {
        var map = {};
        providerPins.forEach(function (pin) {
            var normalized = normalizeProviderPin(pin);
            if (normalized) map[normalized.cid] = normalized;
        });
        indexEntries.forEach(function (file) {
            var normalized = normalizeIndexFile(file);
            if (!normalized) return;
            var existing = map[normalized.cid];
            if (existing) {
                map[normalized.cid] = {
                    cid: normalized.cid,
                    name: normalized.name || existing.name,
                    size: normalized.size || existing.size,
                    date: normalized.date || existing.date,
                    type: normalized.type || existing.type,
                    gateway: normalized.gateway || existing.gateway,
                    source: 'index+provider'
                };
            } else {
                map[normalized.cid] = normalized;
            }
        });
        return Object.keys(map).map(function (cid) { return map[cid]; });
    }

    function syncIndexFiles(force, showStatus) {
        var key = getActiveKey && getActiveKey();
        if (!key) return Promise.resolve({ files: [], cid: null });

        if (typeof WalletAuth === 'undefined' || !WalletAuth.isConnected()) {
            if (showStatus) updateSyncStatus(null, 'Connect wallet to sync');
            return Promise.resolve({ files: [], cid: null });
        }
        if (typeof IpfsIndex === 'undefined' || !IpfsIndex.syncFiles) {
            if (showStatus) updateSyncStatus(null, 'Index module not loaded');
            return Promise.resolve({ files: [], cid: null });
        }

        if (syncInFlight) return Promise.resolve({ files: indexFiles || [], cid: indexCid || null });
        syncInFlight = true;

        var walletAddr = WalletAuth.getAddress();
        if (showStatus) setSyncing(true);

        return IpfsIndex.syncFiles({ providerId: key.provider, apiKey: key.key, walletAddr: walletAddr }).then(function (res) {
            indexFiles = (res && res.files) ? res.files : [];
            indexCid = res && res.cid ? res.cid : null;
            updateSyncStatus(walletAddr);
            return res;
        }).catch(function (err) {
            if (showStatus) updateSyncStatus(walletAddr, (err && err.message) ? err.message : 'Sync failed');
            return { files: [], cid: null, error: err };
        }).finally(function () {
            syncInFlight = false;
            if (showStatus) setSyncing(false);
        });
    }

    function loadFiles(options) {
        var key = getActiveKey(); if (!key) return; showLoading(true);
        resolveAdapter();

        var pinsPromise = providerAdapter && providerAdapter.listPins ?
            providerAdapter.listPins({ apiKey: key.key, sort: 'DESC', limit: 100 }) :
            Promise.resolve({ pins: [] });

        pinsPromise = pinsPromise.catch(function () { return { pins: [] }; });

        var indexPromise = syncIndexFiles(options && options.forceSync, options && options.showSyncStatus);

        Promise.all([pinsPromise, indexPromise]).then(function (results) {
            var providerPins = (results[0] && results[0].pins) ? results[0].pins : [];
            var indexResult = results[1] || { files: [], cid: null };
            indexFiles = indexResult.files || indexFiles;
            indexCid = indexResult.cid || indexCid;
            allPins = mergePins(providerPins, indexFiles);
            applyFilters();
            showLoading(false);
            loadStorage(key.key);
        }).catch(function () {
            allPins = mergePins([], indexFiles || []);
            applyFilters();
            showLoading(false);
        });
    }

    function loadStorage(apiKey) {
        resolveAdapter();
        if (!providerAdapter || !providerAdapter.getUsage) {
            els.storageText.textContent = 'Unable to calculate';
            return;
        }
        providerAdapter.getUsage(apiKey).then(function (usage) {
            var pct = usage.percent;
            els.storageText.textContent = fmt(usage.totalSize) + ' of ' + fmt(usage.maxSize);
            els.storageFill.style.width = Math.min(pct, 100) + '%';
            els.storageFill.className = 'storage-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
            if (pct >= 90) { els.storageWarning.style.display = 'block'; }
        }).catch(function () {
            els.storageText.textContent = 'Unable to calculate';
        });
    }
    function applyFilters() {
        var pins = allPins.slice();
        if (searchQuery) { var q = searchQuery.toLowerCase(); pins = pins.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1 || p.cid.toLowerCase().indexOf(q) !== -1; }); }
        if (currentFilter !== 'all') { pins = pins.filter(function (p) { return typeForPin(p) === currentFilter; }); }
        if (currentSort === 'newest') pins.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        else if (currentSort === 'oldest') pins.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
        else if (currentSort === 'largest') pins.sort(function (a, b) { return b.size - a.size; });
        else if (currentSort === 'smallest') pins.sort(function (a, b) { return a.size - b.size; });
        filteredPins = pins; render();
    }
    function showLoading(show) { els.fmLoading.style.display = show ? 'block' : 'none'; if (show) { els.fmGrid.style.display = 'none'; els.fmListWrap.style.display = 'none'; els.fmEmpty.style.display = 'none'; els.fmNoResults.style.display = 'none'; } }
    function render() {
        if (allPins.length === 0 && !searchQuery && currentFilter === 'all') { els.fmGrid.style.display = 'none'; els.fmListWrap.style.display = 'none'; els.fmEmpty.style.display = 'block'; els.fmNoResults.style.display = 'none'; return; }
        if (filteredPins.length === 0) { els.fmGrid.style.display = 'none'; els.fmListWrap.style.display = 'none'; els.fmEmpty.style.display = 'none'; els.fmNoResults.style.display = 'block'; return; }
        els.fmEmpty.style.display = 'none'; els.fmNoResults.style.display = 'none';
        if (currentView === 'grid') { renderGrid(); els.fmGrid.style.display = 'grid'; els.fmListWrap.style.display = 'none'; } else { renderList(); els.fmGrid.style.display = 'none'; els.fmListWrap.style.display = 'block'; }
        updateBulkBar();
    }
    function renderGrid() {
        els.fmGrid.innerHTML = ''; filteredPins.forEach(function (pin) {
            var card = document.createElement('div'); card.className = 'fm-card'; card.setAttribute('data-cid', pin.cid);
            card.innerHTML = '<div class="fm-card-top"><input type="checkbox" class="fm-card-check" data-cid="' + pin.cid + '"' + (selectedCids.has(pin.cid) ? ' checked' : '') + '><div class="fm-card-icon">' + iconFor(pin) + '</div><div class="fm-card-info"><div class="fm-card-name" title="' + pin.name + '">' + pin.name + '</div><div class="fm-card-cid" title="' + pin.cid + '">' + truncCid(pin.cid) + '</div></div></div><div class="fm-card-meta"><span>' + fmt(pin.size) + '</span><span>' + fmtDate(pin.date) + '</span><span class="fm-card-badge active">Active</span></div><div class="fm-card-actions"><button class="btn-icon-sm fm-act" data-act="ipfs" data-cid="' + pin.cid + '" title="Copy IPFS link">📋</button><button class="btn-icon-sm fm-act" data-act="gw" data-cid="' + pin.cid + '" title="Copy Gateway link">🔗</button><a class="btn-icon-sm fm-act" href="' + gwUrl(pin) + '" target="_blank" rel="noopener" title="Open in new tab">↗</a><button class="btn-icon-sm fm-act" data-act="versions" data-name="' + pin.name + '" title="Versions">🕐</button><button class="btn-icon-sm fm-act fm-btn-danger" data-act="unpin" data-cid="' + pin.cid + '" title="Unpin">✕</button></div>';
            els.fmGrid.appendChild(card);
        });
    }
    function renderList() {
        els.fmListBody.innerHTML = ''; filteredPins.forEach(function (pin) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td class="fm-td-check"><input type="checkbox" data-cid="' + pin.cid + '"' + (selectedCids.has(pin.cid) ? ' checked' : '') + '></td><td><div class="fm-td-name">' + iconFor(pin) + ' <span title="' + pin.name + '">' + pin.name + '</span></div></td><td>' + fmt(pin.size) + '</td><td>' + fmtDate(pin.date) + '</td><td>' + typeForPin(pin).toUpperCase() + '</td><td><div class="fm-td-actions"><button class="btn-icon-sm fm-act" data-act="ipfs" data-cid="' + pin.cid + '">📋</button><button class="btn-icon-sm fm-act" data-act="gw" data-cid="' + pin.cid + '">🔗</button><a class="btn-icon-sm" href="' + gwUrl(pin) + '" target="_blank" rel="noopener">↗</a><button class="btn-icon-sm fm-act" data-act="versions" data-name="' + pin.name + '">🕐</button><button class="btn-icon-sm fm-act fm-btn-danger" data-act="unpin" data-cid="' + pin.cid + '">✕</button></div></td>';
            els.fmListBody.appendChild(tr);
        });
    }
    function setView(view) {
        currentView = view; localStorage.setItem('fm_view', view);
        document.querySelectorAll('.fm-view-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
        var container = els.fmGrid.parentElement; if (container) container.classList.add('fm-view-transition');
        render();
        setTimeout(function () { if (container) container.classList.remove('fm-view-transition'); }, 350);
    }
    function toggleSelect(cid, checked) { if (checked) selectedCids.add(cid); else selectedCids.delete(cid); updateBulkBar(); }
    function updateBulkBar() { var count = selectedCids.size; els.fmBulkBar.classList.toggle('visible', count > 0); els.fmBulkCount.textContent = count + ' selected'; }
    function selectAll(checked) { selectedCids.clear(); if (checked) { filteredPins.forEach(function (p) { selectedCids.add(p.cid); }); } render(); }
    function openVersions(name) {
        els.vpSiteName.textContent = name;
        var versions = allPins.filter(function (p) { return p.name === name || p.name.replace(/-v\d+$/, '') === name.replace(/-v\d+$/, ''); }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        if (els.vpCompareBtn) els.vpCompareBtn.style.display = versions.length >= 2 ? 'inline-flex' : 'none';
        compareMode = false; compareSelected = [];
        if (els.vpCompareBar) els.vpCompareBar.style.display = 'none';
        renderVersionList(versions);
        els.versionOverlay.classList.add('open'); els.versionPanel.classList.add('open');
    }
    function renderVersionList(versions) {
        els.versionList.innerHTML = '';
        versions.forEach(function (v, i) {
            var ver = document.createElement('div'); ver.className = 'version-item';
            var verNum = versions.length - i;
            var radioHtml = compareMode ? '<input type="checkbox" class="version-compare-check" data-cid="' + v.cid + '" data-idx="' + i + '"' + (compareSelected.indexOf(v.cid) !== -1 ? ' checked' : '') + '> ' : '';
            ver.innerHTML = '<div class="version-item-head">' + radioHtml + '<span class="version-item-ver">v' + verNum + '</span><span class="version-item-date">' + fmtDate(v.date) + '</span></div><div class="version-item-cid">' + v.cid + '</div><div class="version-item-meta"><span>Size: ' + fmt(v.size) + '</span></div><div class="version-item-actions"><button class="btn btn-secondary btn-sm fm-act" data-act="gw" data-cid="' + v.cid + '">🔗 Open</button><button class="btn btn-secondary btn-sm fm-act" data-act="ipfs" data-cid="' + v.cid + '">📋 Copy CID</button>' + (i > 0 ? '<button class="btn btn-secondary btn-sm fm-act" data-act="rollback" data-cid="' + v.cid + '">🔄 Rollback</button>' : '') + '</div>';
            els.versionList.appendChild(ver);
        });
    }
    function closeVersions() { els.versionOverlay.classList.remove('open'); els.versionPanel.classList.remove('open'); compareMode = false; compareSelected = []; }
    function openUnpinModal(cid) { unpinTarget = cid; els.unpinCid.textContent = cid; els.unpinOverlay.classList.add('open'); }
    function closeUnpinModal() { els.unpinOverlay.classList.remove('open'); unpinTarget = null; }
    function confirmUnpinAction() {
        if (!unpinTarget) return; var key = getActiveKey(); if (!key) return; var cid = unpinTarget; closeUnpinModal();
        resolveAdapter();
        if (!providerAdapter || !providerAdapter.unpin) { alert('Unpin not supported by this provider.'); return; }
        providerAdapter.unpin(cid, key.key).then(function () { allPins = allPins.filter(function (p) { return p.cid !== cid; }); selectedCids.delete(cid); applyFilters(); }).catch(function (err) { alert(err.message || 'Failed to unpin'); });
    }
    function openBulkUnpinModal() { var c = selectedCids.size; els.bulkCount.textContent = c; els.bulkCount2.textContent = c; els.bulkUnpinOverlay.classList.add('open'); }
    function closeBulkUnpinModal() { els.bulkUnpinOverlay.classList.remove('open'); }
    function confirmBulkUnpinAction() {
        var key = getActiveKey(); if (!key) return; var cids = Array.from(selectedCids); closeBulkUnpinModal();
        resolveAdapter();
        if (typeof StorageProviders === 'undefined' || !StorageProviders.unpinBulk) { alert('Bulk unpin not supported by this provider.'); return; }
        StorageProviders.unpinBulk(providerAdapter, cids, key.key).then(function (res) { res.success.forEach(function (cid) { allPins = allPins.filter(function (p) { return p.cid !== cid; }); selectedCids.delete(cid); }); applyFilters(); if (res.failed.length > 0) alert(res.failed.length + ' files failed to unpin.'); }).catch(function (err) { alert(err.message || 'Failed to unpin files.'); });
    }
    var rollbackTarget = null;
    function openRollbackModal(cid) { rollbackTarget = cid; if (els.rollbackCid) els.rollbackCid.textContent = cid; if (els.rollbackOverlay) els.rollbackOverlay.classList.add('open'); }
    function closeRollbackModal() { if (els.rollbackOverlay) els.rollbackOverlay.classList.remove('open'); rollbackTarget = null; }
    function confirmRollbackAction() {
        if (!rollbackTarget) return;
        resolveAdapter();
        var pin = findPinByCid(rollbackTarget);
        var url = gwUrl(pin || rollbackTarget); window.open(url, '_blank'); closeRollbackModal();
    }
    function startCompare() {
        compareMode = true; compareSelected = []; if (els.vpCompareBar) els.vpCompareBar.style.display = 'flex'; if (els.vpCompareCount) els.vpCompareCount.textContent = '0 selected';
        var name = els.vpSiteName.textContent; var versions = allPins.filter(function (p) { return p.name === name || p.name.replace(/-v\d+$/, '') === name.replace(/-v\d+$/, ''); }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        renderVersionList(versions);
    }
    function cancelCompare() {
        compareMode = false; compareSelected = []; if (els.vpCompareBar) els.vpCompareBar.style.display = 'none';
        var name = els.vpSiteName.textContent; var versions = allPins.filter(function (p) { return p.name === name || p.name.replace(/-v\d+$/, '') === name.replace(/-v\d+$/, ''); }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        renderVersionList(versions);
    }
    function toggleCompareVersion(cid) {
        var idx = compareSelected.indexOf(cid); if (idx !== -1) compareSelected.splice(idx, 1); else { if (compareSelected.length >= 2) compareSelected.shift(); compareSelected.push(cid); }
        if (els.vpCompareCount) els.vpCompareCount.textContent = compareSelected.length + ' selected';
        if (compareSelected.length === 2) showComparison();
        document.querySelectorAll('.version-compare-check').forEach(function (cb) { cb.checked = compareSelected.indexOf(cb.getAttribute('data-cid')) !== -1; });
    }
    function showComparison() {
        var v1 = allPins.find(function (p) { return p.cid === compareSelected[0]; });
        var v2 = allPins.find(function (p) { return p.cid === compareSelected[1]; });
        if (!v1 || !v2) return;
        if (els.compareVersionsRow) els.compareVersionsRow.innerHTML = '<div class="compare-v"><strong>Version A</strong><div class="compare-v-cid">' + truncCid(v1.cid) + '</div><span>' + fmt(v1.size) + '</span><span>' + fmtDate(v1.date) + '</span></div><div class="compare-arrow">⇄</div><div class="compare-v"><strong>Version B</strong><div class="compare-v-cid">' + truncCid(v2.cid) + '</div><span>' + fmt(v2.size) + '</span><span>' + fmtDate(v2.date) + '</span></div>';
        var sizeDiff = v2.size - v1.size; var sign = sizeDiff >= 0 ? '+' : '';
        if (els.compareStats) els.compareStats.innerHTML = '<div class="compare-stat"><span class="compare-stat-label">Size Change</span><span class="compare-stat-value">' + sign + fmt(Math.abs(sizeDiff)) + '</span></div><div class="compare-stat"><span class="compare-stat-label">Time Gap</span><span class="compare-stat-value">' + timeDiff(v1.date, v2.date) + '</span></div>';
        if (els.compareOverlay) els.compareOverlay.classList.add('open');
    }
    function timeDiff(d1, d2) { var ms = Math.abs(new Date(d2) - new Date(d1)); var days = Math.floor(ms / 86400000); if (days > 0) return days + ' day' + (days > 1 ? 's' : ''); var hrs = Math.floor(ms / 3600000); return hrs + ' hour' + (hrs !== 1 ? 's' : ''); }
    function closeCompareModal() { if (els.compareOverlay) els.compareOverlay.classList.remove('open'); }
    function bindEvents() {
        els.fmSearch.addEventListener('input', function () { searchQuery = els.fmSearch.value.trim(); applyFilters(); });
        els.fmSort.addEventListener('change', function () { currentSort = els.fmSort.value; applyFilters(); });
        document.querySelectorAll('.fm-filter').forEach(function (btn) { btn.addEventListener('click', function () { document.querySelectorAll('.fm-filter').forEach(function (b) { b.classList.remove('active'); }); btn.classList.add('active'); currentFilter = btn.getAttribute('data-filter'); applyFilters(); }); });
        document.querySelectorAll('.fm-view-btn').forEach(function (btn) { btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); }); });
        document.querySelectorAll('.fm-sortable').forEach(function (th) {
            th.addEventListener('click', function () {
                var col = th.getAttribute('data-col');
                document.querySelectorAll('.fm-sortable').forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
                if (col === 'name') filteredPins.sort(function (a, b) { return a.name.localeCompare(b.name); });
                else if (col === 'size') filteredPins.sort(function (a, b) { return b.size - a.size; });
                else if (col === 'date') filteredPins.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
                else if (col === 'type') filteredPins.sort(function (a, b) { return typeForPin(a).localeCompare(typeForPin(b)); });
                th.classList.add('sort-desc'); render();
            });
        });
        document.addEventListener('click', function (e) {
            var actBtn = e.target.closest('.fm-act'); if (!actBtn) return;
            var act = actBtn.getAttribute('data-act'), cid = actBtn.getAttribute('data-cid');
            if (act === 'ipfs') copyText(ipfsUrl(cid), actBtn);
            else if (act === 'gw') { var pin = findPinByCid(cid); copyText(gwUrl(pin || cid), actBtn); }
            else if (act === 'unpin') openUnpinModal(cid);
            else if (act === 'versions') openVersions(actBtn.getAttribute('data-name'));
            else if (act === 'rollback') openRollbackModal(cid);
        });
        document.addEventListener('change', function (e) {
            if (e.target.matches('.fm-card-check,.fm-td-check input')) { toggleSelect(e.target.getAttribute('data-cid'), e.target.checked); }
            if (e.target.matches('.version-compare-check')) { toggleCompareVersion(e.target.getAttribute('data-cid')); }
        });
        els.fmSelectAll.addEventListener('change', function () { selectAll(els.fmSelectAll.checked); });
        if (els.fmSelectAllList) els.fmSelectAllList.addEventListener('change', function () { selectAll(els.fmSelectAllList.checked); });
        document.getElementById('fmBulkCopy').addEventListener('click', function () { var json = JSON.stringify(Array.from(selectedCids)); navigator.clipboard.writeText(json).then(function () { alert('Copied ' + selectedCids.size + ' CIDs to clipboard.'); }); });
        document.getElementById('fmBulkUnpin').addEventListener('click', openBulkUnpinModal);
        els.confirmUnpin.addEventListener('click', confirmUnpinAction);
        els.cancelUnpin.addEventListener('click', closeUnpinModal);
        els.confirmBulkUnpin.addEventListener('click', confirmBulkUnpinAction);
        els.cancelBulkUnpin.addEventListener('click', closeBulkUnpinModal);
        els.closeVersionPanel.addEventListener('click', closeVersions);
        els.versionOverlay.addEventListener('click', closeVersions);
        if (els.vpCompareBtn) els.vpCompareBtn.addEventListener('click', startCompare);
        if (els.vpCancelCompare) els.vpCancelCompare.addEventListener('click', cancelCompare);
        if (els.confirmRollback) els.confirmRollback.addEventListener('click', confirmRollbackAction);
        if (els.cancelRollback) els.cancelRollback.addEventListener('click', closeRollbackModal);
        if (els.closeCompare) els.closeCompare.addEventListener('click', closeCompareModal);
        els.closeStorageWarn.addEventListener('click', function () { els.storageWarning.style.display = 'none'; });
        if (els.fmSyncBtn) els.fmSyncBtn.addEventListener('click', function () { loadFiles({ forceSync: true, showSyncStatus: true }); });
        els.fmGoUpload.addEventListener('click', function () { document.getElementById('tabUpload').click(); });
    }
    function prefetchIndex() {
        return syncIndexFiles(false, false);
    }
    return { init: init, loadFiles: loadFiles, prefetchIndex: prefetchIndex };
})();
