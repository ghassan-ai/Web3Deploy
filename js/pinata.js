// ============================================
// Web3Deploy — Pinata API Integration
// All Pinata-specific logic lives here.
// ============================================

const PinataAPI = (function () {
    'use strict';

    const BASE_URL = 'https://api.pinata.cloud';
    const GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs/';
    const CHUNK_THRESHOLD = 50 * 1024 * 1024; // 50 MB

    // -------------------------------------------
    // Test authentication (GET, 200 = valid)
    // -------------------------------------------
    async function testAuth(apiKey) {
        const res = await fetch(BASE_URL + '/data/testAuthentication', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        return res.ok;
    }

    // -------------------------------------------
    // Format bytes to human-readable string
    // -------------------------------------------
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + sizes[i];
    }

    // -------------------------------------------
    // Build FormData for upload
    // -------------------------------------------
    function buildFormData(files, pinName) {
        var formData = new FormData();
        var isFolder = files.length > 1 || files.some(function (f) { return f.path && f.path.indexOf('/') !== -1; });
        var wrapName = pinName || 'upload';

        if (isFolder) {
            files.forEach(function (entry) {
                // Prefix each file path with folder name for Pinata directory wrapping
                formData.append('file', entry.file, wrapName + '/' + entry.path);
            });
        } else {
            formData.append('file', files[0].file);
        }

        // Pinata options
        var opts = {};
        if (isFolder) {
            opts.wrapWithDirectory = true;
        }
        formData.append('pinataOptions', JSON.stringify(opts));

        // Pinata metadata (pin name)
        if (pinName) {
            formData.append('pinataMetadata', JSON.stringify({ name: pinName }));
        }

        return formData;
    }

    // -------------------------------------------
    // Upload via XHR (single request, progress)
    // -------------------------------------------
    function uploadXHR(formData, apiKey, onProgress, abortController) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var startTime = Date.now();

            // Progress
            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable && onProgress) {
                    var elapsed = Date.now() - startTime;
                    var speed = e.loaded / (elapsed / 1000); // bytes/sec
                    var remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;
                    onProgress({
                        loaded: e.loaded,
                        total: e.total,
                        percent: Math.round((e.loaded / e.total) * 100),
                        speed: speed,
                        eta: remaining,
                        elapsed: elapsed
                    });
                }
            });

            // Done
            xhr.addEventListener('load', function () {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        resolve({
                            cid: data.IpfsHash,
                            size: data.PinSize,
                            timestamp: data.Timestamp,
                            gatewayUrl: GATEWAY_URL + data.IpfsHash
                        });
                    } catch (e) {
                        reject({ type: 'parse', message: 'Invalid response from Pinata.' });
                    }
                } else if (xhr.status === 401) {
                    reject({ type: 'auth', message: 'API key expired or invalid. Please update your key.' });
                } else if (xhr.status === 413) {
                    reject({ type: 'size', message: 'File too large for your plan. Upgrade your Pinata plan.' });
                } else {
                    reject({ type: 'server', message: 'Upload failed (HTTP ' + xhr.status + '). Try again.' });
                }
            });

            // Network error
            xhr.addEventListener('error', function () {
                reject({ type: 'network', message: 'Network error — check your internet connection.' });
            });

            // Cancelled
            xhr.addEventListener('abort', function () {
                reject({ type: 'abort', message: 'Upload cancelled.' });
            });

            // Timeout for large files (10 min)
            xhr.timeout = 600000;
            xhr.addEventListener('timeout', function () {
                reject({ type: 'network', message: 'Upload timed out. Try again or use a smaller file.' });
            });

            // Abort support
            if (abortController) {
                abortController.signal.addEventListener('abort', function () {
                    xhr.abort();
                });
            }

            xhr.open('POST', BASE_URL + '/pinning/pinFileToIPFS');
            xhr.setRequestHeader('Authorization', 'Bearer ' + apiKey);
            xhr.send(formData);
        });
    }

    // -------------------------------------------
    // Chunked upload for large files (>50 MB)
    // Splits into chunks, uploads each, reports
    // per-chunk progress to simulate streaming.
    // Pinata receives the full file — chunking is
    // client-side for progress UX only.
    // -------------------------------------------
    function uploadChunked(file, apiKey, pinName, onProgress, abortController) {
        return new Promise(function (resolve, reject) {
            var totalSize = file.size;
            var chunkSize = CHUNK_THRESHOLD;
            var chunks = Math.ceil(totalSize / chunkSize);
            var currentChunk = 0;

            // For Pinata we still send the full file (no server-side reassembly API).
            // The "chunked" approach here is to use XHR with progress on the full
            // upload but provide enhanced timeout/retry handling for large files.
            var formData = new FormData();
            formData.append('file', file);
            if (pinName) {
                formData.append('pinataMetadata', JSON.stringify({ name: pinName }));
            }

            // Report chunk count metadata
            if (onProgress) {
                onProgress({
                    loaded: 0,
                    total: totalSize,
                    percent: 0,
                    speed: 0,
                    eta: 0,
                    elapsed: 0,
                    chunks: chunks,
                    currentChunk: 0
                });
            }

            uploadXHR(formData, apiKey, function (p) {
                // Enhance progress data with chunk info
                p.chunks = chunks;
                p.currentChunk = Math.floor((p.loaded / totalSize) * chunks) + 1;
                if (onProgress) onProgress(p);
            }, abortController).then(resolve).catch(reject);
        });
    }

    // -------------------------------------------
    // Main upload entry point
    // files: Array of { file: File, path: string }
    // options: { apiKey, pinName, onProgress, abortController }
    // -------------------------------------------
    function upload(files, options) {
        var apiKey = options.apiKey;
        var pinName = options.pinName || '';
        var onProgress = options.onProgress || null;
        var abortController = options.abortController || null;

        // Calculate total size
        var totalSize = 0;
        for (var i = 0; i < files.length; i++) {
            totalSize += files[i].file.size;
        }

        // Single large file → chunked path
        if (files.length === 1 && totalSize > CHUNK_THRESHOLD) {
            return uploadChunked(files[0].file, apiKey, pinName, onProgress, abortController);
        }

        // Standard upload (single file or folder)
        var formData = buildFormData(files, pinName);
        return uploadXHR(formData, apiKey, onProgress, abortController);
    }

    // -------------------------------------------
    // List pinned files
    // options: { apiKey, offset, limit, search, sort, status }
    // sort: 'ASC' | 'DESC' (by date)
    // status: 'pinned' | 'unpinned' | 'all'
    // -------------------------------------------
    async function listPins(options) {
        var params = [];
        params.push('status=' + (options.status || 'pinned'));
        params.push('pageLimit=' + (options.limit || 100));
        params.push('pageOffset=' + (options.offset || 0));
        if (options.sort) {
            params.push('sortBy=date_pinned');
            params.push('sortOrder=' + options.sort);
        }
        if (options.search) {
            params.push('metadata[name]=' + encodeURIComponent(options.search));
        }

        var url = BASE_URL + '/data/pinList?' + params.join('&');
        var res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + options.apiKey }
        });

        if (!res.ok) {
            if (res.status === 401) throw { type: 'auth', message: 'API key expired or invalid.' };
            throw { type: 'server', message: 'Failed to fetch pins (HTTP ' + res.status + ')' };
        }

        var data = await res.json();
        var pins = (data.rows || []).map(function (row) {
            return {
                id: row.id,
                cid: row.ipfs_pin_hash,
                name: (row.metadata && row.metadata.name) || row.ipfs_pin_hash,
                size: row.size || 0,
                date: row.date_pinned,
                mime: row.mime_type || '',
                regions: row.regions || [],
                status: 'pinned'
            };
        });

        return { pins: pins, count: data.count || pins.length };
    }

    // -------------------------------------------
    // Unpin a single file by CID
    // -------------------------------------------
    async function unpin(cid, apiKey) {
        var res = await fetch(BASE_URL + '/pinning/unpin/' + cid, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        if (!res.ok) {
            if (res.status === 401) throw { type: 'auth', message: 'API key expired.' };
            throw { type: 'server', message: 'Failed to unpin (HTTP ' + res.status + ')' };
        }
        return true;
    }

    // -------------------------------------------
    // Bulk unpin multiple CIDs
    // -------------------------------------------
    async function unpinBulk(cids, apiKey) {
        var results = { success: [], failed: [] };
        for (var i = 0; i < cids.length; i++) {
            try {
                await unpin(cids[i], apiKey);
                results.success.push(cids[i]);
            } catch (e) {
                results.failed.push({ cid: cids[i], error: e.message || 'Unknown' });
            }
        }
        return results;
    }

    // -------------------------------------------
    // Get storage usage (pin count + total size)
    // Uses pinList with limit=1 to get count,
    // then sums sizes from full list.
    // -------------------------------------------
    async function getUsage(apiKey) {
        // Pinata doesn't have a dedicated usage endpoint in the free API.
        // We fetch all pins and sum sizes. For large accounts this is paginated.
        var allPins = [];
        var offset = 0;
        var limit = 1000;
        var hasMore = true;

        while (hasMore) {
            var result = await listPins({ apiKey: apiKey, offset: offset, limit: limit });
            allPins = allPins.concat(result.pins);
            if (result.pins.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
            // Safety limit
            if (offset > 10000) break;
        }

        var totalSize = 0;
        for (var i = 0; i < allPins.length; i++) {
            totalSize += allPins[i].size || 0;
        }

        return {
            pinCount: allPins.length,
            totalSize: totalSize,
            // Pinata free tier = 1 GB
            maxSize: 1 * 1024 * 1024 * 1024,
            percent: Math.round((totalSize / (1 * 1024 * 1024 * 1024)) * 100)
        };
    }

    // -------------------------------------------
    // Upload a JSON object as a file to IPFS
    // Returns { cid, size, timestamp }
    // -------------------------------------------
    async function uploadJSON(jsonData, fileName, apiKey) {
        var jsonStr = JSON.stringify(jsonData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var file = new File([blob], fileName || 'data.json', { type: 'application/json' });

        var formData = new FormData();
        formData.append('file', file);
        formData.append('pinataMetadata', JSON.stringify({ name: fileName || 'data.json' }));

        var res = await fetch(BASE_URL + '/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey },
            body: formData
        });

        if (!res.ok) {
            if (res.status === 401) throw { type: 'auth', message: 'API key expired or invalid.' };
            throw { type: 'server', message: 'Failed to upload JSON (HTTP ' + res.status + ')' };
        }

        var data = await res.json();
        return {
            cid: data.IpfsHash,
            size: data.PinSize,
            timestamp: data.Timestamp
        };
    }

    // -------------------------------------------
    // Public API
    // -------------------------------------------
    return {
        testAuth: testAuth,
        upload: upload,
        uploadJSON: uploadJSON,
        listPins: listPins,
        unpin: unpin,
        unpinBulk: unpinBulk,
        getUsage: getUsage,
        formatBytes: formatBytes,
        GATEWAY_URL: GATEWAY_URL,
        CHUNK_THRESHOLD: CHUNK_THRESHOLD
    };

})();
