// ============================================
// Web3Deploy — Main Application Logic
// ============================================

(function () {
    'use strict';

    // ===========================================
    // Constants & Provider Config
    // ===========================================
    const STORAGE_KEY = 'web3deploy_keys';
    const ACTIVE_KEY = 'web3deploy_active';

    const PROVIDERS = {
        pinata: {
            name: 'Pinata',
            icon: '📌',
            verifyUrl: 'https://api.pinata.cloud/data/testAuthentication',
            hint: 'Get your free API key from <a href="https://app.pinata.cloud/developers/api-keys" target="_blank" rel="noopener">Pinata Dashboard</a>',
            buildHeaders: (key) => ({
                'Authorization': 'Bearer ' + key
            })
        },
        filebase: {
            name: 'Filebase',
            icon: '🗄️',
            verifyUrl: null, // S3-compatible — no simple REST verify
            hint: 'Get your access token from <a href="https://console.filebase.com/" target="_blank" rel="noopener">Filebase Console</a>',
            buildHeaders: null
        },
        lighthouse: {
            name: 'Lighthouse',
            icon: '🏗️',
            verifyUrl: null, // No simple test endpoint
            hint: 'Get your API key from <a href="https://files.lighthouse.storage/" target="_blank" rel="noopener">Lighthouse Dashboard</a>',
            buildHeaders: null
        }
    };


    // ===========================================
    // Shared — Navbar Scroll Effect
    // ===========================================
    const navbar = document.getElementById('navbar');

    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 30);
        }, { passive: true });
    }


    // ===========================================
    // Shared — Mobile Nav Toggle
    // ===========================================
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            navLinks.classList.toggle('open');
        });

        // Close menu when a link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('active');
                navLinks.classList.remove('open');
            });
        });
    }


    // ===========================================
    // Landing Page — FAQ Accordion
    // ===========================================
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const parentItem = question.closest('.faq-item');
            const isActive = parentItem.classList.contains('active');

            // Close all other items
            document.querySelectorAll('.faq-item.active').forEach(item => {
                item.classList.remove('active');
            });

            // Toggle the clicked item
            if (!isActive) {
                parentItem.classList.add('active');
            }
        });
    });


    // ===========================================
    // Landing Page — Scroll Reveal Animation
    // ===========================================
    const revealElements = document.querySelectorAll('.reveal');

    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        revealElements.forEach(el => revealObserver.observe(el));
    }


    // ===========================================
    // Landing Page — Smooth Scroll for Anchors
    // ===========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const targetId = anchor.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const navHeight = navbar ? navbar.offsetHeight : 0;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });


    // ===========================================
    // Dashboard — Auth System
    // ===========================================
    const setupScreen = document.getElementById('setupScreen');
    const dashboardContent = document.getElementById('dashboardContent');

    // Only run dashboard logic if we're on the dashboard page
    if (setupScreen && dashboardContent) {
        initDashboard();
    }

    function initDashboard() {
        // DOM references
        const setupForm = document.getElementById('setupForm');
        const providerSelect = document.getElementById('providerSelect');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const verifyBtn = document.getElementById('verifyBtn');
        const verifyBtnText = document.getElementById('verifyBtnText');
        const formMessage = document.getElementById('formMessage');
        const providerHint = document.getElementById('providerHint');
        const toggleKeyVis = document.getElementById('toggleKeyVis');
        const eyeOpen = document.getElementById('eyeOpen');
        const eyeClosed = document.getElementById('eyeClosed');

        // Navbar provider elements
        const navProviderStatus = document.getElementById('navProviderStatus');
        const providerBadge = document.getElementById('providerBadge');
        const activeProviderName = document.getElementById('activeProviderName');
        const providerDropdown = document.getElementById('providerDropdown');
        const providerDropdownList = document.getElementById('providerDropdownList');
        const addNewKeyBtn = document.getElementById('addNewKeyBtn');
        const removeKeyBtn = document.getElementById('removeKeyBtn');

        // Upload system initialized flag
        let uploadInitialized = false;

        // -------------------------------------------
        // localStorage Helpers
        // -------------------------------------------
        function getSavedKeys() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        function saveKeys(keys) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
        }

        function getActiveIndex() {
            const idx = parseInt(localStorage.getItem(ACTIVE_KEY), 10);
            const keys = getSavedKeys();
            if (isNaN(idx) || idx < 0 || idx >= keys.length) return 0;
            return idx;
        }

        function setActiveIndex(idx) {
            localStorage.setItem(ACTIVE_KEY, String(idx));
        }

        function getActiveKey() {
            const keys = getSavedKeys();
            if (keys.length === 0) return null;
            return keys[getActiveIndex()] || keys[0];
        }

        // -------------------------------------------
        // UI State Management
        // -------------------------------------------
        function showSetup() {
            setupScreen.style.display = 'flex';
            dashboardContent.classList.remove('active');
            navProviderStatus.classList.remove('active');

            // Reset form
            apiKeyInput.value = '';
            clearMessage();
            verifyBtn.classList.remove('loading');
            verifyBtn.disabled = false;

            // If keys exist, this is "add new key" mode
            const keys = getSavedKeys();
            if (keys.length > 0) {
                navProviderStatus.classList.add('active');
                updateNavBadge();
            }
        }

        function showDashboard() {
            const active = getActiveKey();
            if (!active) {
                showSetup();
                return;
            }

            setupScreen.style.display = 'none';
            dashboardContent.classList.add('active');

            // Update navbar badge
            navProviderStatus.classList.add('active');
            updateNavBadge();

            // Initialize upload system once
            if (!uploadInitialized) {
                uploadInitialized = true;
                initUpload(getActiveKey);
                initTabs(getActiveKey);
            }

            if (typeof FileManager !== 'undefined') {
                FileManager.init(getActiveKey);
                FileManager.prefetchIndex();
            }
        }

        // -------------------------------------------
        // Tab Switching
        // -------------------------------------------
        function initTabs(getKeyFn) {
            var tabs = document.querySelectorAll('.dash-tab');
            var panels = document.querySelectorAll('.tab-panel');
            var fmLoaded = false;
            var dmLoaded = false;

            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    var target = tab.getAttribute('data-tab');

                    // Update active tab
                    tabs.forEach(function (t) { t.classList.remove('active'); });
                    tab.classList.add('active');

                    // Update active panel
                    panels.forEach(function (p) { p.classList.remove('active'); });
                    var panel = document.getElementById('panel' + target.charAt(0).toUpperCase() + target.slice(1));
                    if (panel) panel.classList.add('active');

                    // Load file manager data when first switching to Files tab
                    if (target === 'files') {
                        if (typeof FileManager !== 'undefined') {
                            if (!fmLoaded) {
                                FileManager.init(getKeyFn);
                                fmLoaded = true;
                            }
                            FileManager.loadFiles({ showSyncStatus: true });
                        }
                    }

                    // Load domain manager when switching to Domains tab
                    if (target === 'domains') {
                        if (typeof DomainManager !== 'undefined') {
                            if (!dmLoaded) {
                                DomainManager.init(getKeyFn);
                                dmLoaded = true;
                            }
                            DomainManager.populateCids();
                            DomainManager.loadDomains({ showSyncStatus: true });
                        }
                    }
                });
            });
        }

        function updateNavBadge() {
            const active = getActiveKey();
            if (!active) return;

            const config = PROVIDERS[active.provider];
            if (activeProviderName) {
                activeProviderName.textContent = config ? config.name : active.provider;
            }

            // Build dropdown list
            renderDropdownList();
        }

        function renderDropdownList() {
            const keys = getSavedKeys();
            const activeIdx = getActiveIndex();

            providerDropdownList.innerHTML = '';

            keys.forEach((entry, idx) => {
                const config = PROVIDERS[entry.provider];
                const item = document.createElement('button');
                item.className = 'provider-dropdown-item' + (idx === activeIdx ? ' active' : '');
                item.innerHTML =
                    '<span class="item-icon">' + (config ? config.icon : '🔗') + '</span>' +
                    '<span class="item-name">' + (config ? config.name : entry.provider) + '</span>' +
                    '<span class="item-check">✓</span>';

                item.addEventListener('click', () => {
                    setActiveIndex(idx);
                    closeDropdown();
                    showDashboard();
                });

                providerDropdownList.appendChild(item);
            });
        }

        // -------------------------------------------
        // Provider Dropdown Toggle
        // -------------------------------------------
        function openDropdown() {
            providerBadge.classList.add('open');
            providerDropdown.classList.add('open');
        }

        function closeDropdown() {
            providerBadge.classList.remove('open');
            providerDropdown.classList.remove('open');
        }

        function toggleDropdown() {
            if (providerDropdown.classList.contains('open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        }

        providerBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!providerDropdown.contains(e.target) && !providerBadge.contains(e.target)) {
                closeDropdown();
            }
        });

        // Add New Key button
        addNewKeyBtn.addEventListener('click', () => {
            closeDropdown();
            showSetup();
        });

        // Remove Current Key button
        removeKeyBtn.addEventListener('click', () => {
            const keys = getSavedKeys();
            const activeIdx = getActiveIndex();

            if (keys.length === 0) return;

            keys.splice(activeIdx, 1);
            saveKeys(keys);

            if (keys.length === 0) {
                localStorage.removeItem(ACTIVE_KEY);
                closeDropdown();
                showSetup();
            } else {
                setActiveIndex(0);
                closeDropdown();
                showDashboard();
            }
        });

        // -------------------------------------------
        // Provider Select Change — Update Hint
        // -------------------------------------------
        function updateHint() {
            const provider = providerSelect.value;
            const config = PROVIDERS[provider];
            if (providerHint && config) {
                providerHint.innerHTML = config.hint;
            }
        }

        providerSelect.addEventListener('change', updateHint);
        updateHint(); // Set initial hint

        // -------------------------------------------
        // Toggle Password Visibility
        // -------------------------------------------
        toggleKeyVis.addEventListener('click', () => {
            const isPassword = apiKeyInput.type === 'password';
            apiKeyInput.type = isPassword ? 'text' : 'password';
            eyeOpen.style.display = isPassword ? 'none' : 'block';
            eyeClosed.style.display = isPassword ? 'block' : 'none';
        });

        // -------------------------------------------
        // Form Messages
        // -------------------------------------------
        function showMessage(text, type) {
            formMessage.textContent = '';
            formMessage.className = 'form-message visible ' + type;
            formMessage.textContent = text;
        }

        function clearMessage() {
            formMessage.className = 'form-message';
            formMessage.textContent = '';
        }

        // -------------------------------------------
        // API Key Verification
        // -------------------------------------------
        async function verifyPinataKey(apiKey) {
            const config = PROVIDERS.pinata;
            const response = await fetch(config.verifyUrl, {
                method: 'GET',
                headers: config.buildHeaders(apiKey)
            });
            return response.ok; // true if 200
        }

        async function verifyKey(provider, apiKey) {
            if (provider === 'pinata') {
                return await verifyPinataKey(apiKey);
            }

            // For Filebase and Lighthouse, we accept the key if non-empty
            // (no simple REST endpoint to verify without complex S3 signing)
            if (apiKey.trim().length >= 10) {
                return true;
            }
            return false;
        }

        // -------------------------------------------
        // Form Submit Handler
        // -------------------------------------------
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const provider = providerSelect.value;
            const apiKey = apiKeyInput.value.trim();

            // Validation
            if (!apiKey) {
                showMessage('Please enter your API key.', 'error');
                apiKeyInput.focus();
                return;
            }

            if (apiKey.length < 10) {
                showMessage('API key seems too short. Please check and try again.', 'error');
                apiKeyInput.focus();
                return;
            }

            // Check for duplicate
            const existingKeys = getSavedKeys();
            const duplicate = existingKeys.find(k => k.provider === provider && k.key === apiKey);
            if (duplicate) {
                showMessage('This key is already saved for ' + PROVIDERS[provider].name + '.', 'info');
                return;
            }

            // Start verification
            verifyBtn.classList.add('loading');
            verifyBtn.disabled = true;
            clearMessage();

            if (provider === 'pinata') {
                showMessage('Verifying with Pinata API…', 'info');
            } else {
                showMessage('Saving key for ' + PROVIDERS[provider].name + '…', 'info');
            }

            try {
                const isValid = await verifyKey(provider, apiKey);

                if (isValid) {
                    // Save to localStorage
                    const keys = getSavedKeys();
                    keys.push({
                        provider: provider,
                        key: apiKey,
                        verified: provider === 'pinata', // Only Pinata is truly verified
                        addedAt: new Date().toISOString()
                    });
                    saveKeys(keys);
                    setActiveIndex(keys.length - 1);

                    showMessage('✓ Key verified and saved successfully!', 'success');

                    // Transition to dashboard after brief delay
                    setTimeout(() => {
                        showDashboard();
                    }, 1000);
                } else {
                    showMessage('Invalid API key. Please check your key and try again.', 'error');
                    verifyBtn.classList.remove('loading');
                    verifyBtn.disabled = false;
                }
            } catch (err) {
                // Network error or CORS issue
                if (provider === 'pinata') {
                    showMessage('Could not reach Pinata API. Check your key or try again later.', 'error');
                } else {
                    showMessage('Verification failed. Please check your key.', 'error');
                }
                verifyBtn.classList.remove('loading');
                verifyBtn.disabled = false;
            }
        });

        // -------------------------------------------
        // Initial State — Check for Saved Keys
        // -------------------------------------------
        const savedKeys = getSavedKeys();
        if (savedKeys.length > 0) {
            showDashboard();
        } else {
            showSetup();
        }
    }


    // ===========================================
    // Dashboard — Upload Orchestration
    // ===========================================
    function initUpload(getActiveKey) {

        // --- DOM refs ---
        const stateDropZone = document.getElementById('stateDropZone');
        const stateFilePreview = document.getElementById('stateFilePreview');
        const stateUploading = document.getElementById('stateUploading');
        const stateSuccess = document.getElementById('stateSuccess');
        const stateError = document.getElementById('stateError');
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const folderInput = document.getElementById('folderInput');
        const selectFilesBtn = document.getElementById('selectFilesBtn');
        const selectFolderBtn = document.getElementById('selectFolderBtn');
        const pinNameInput = document.getElementById('pinNameInput');
        const pinNameInput2 = document.getElementById('pinNameInput2');
        const fileMeta = document.getElementById('fileMeta');
        const fileListScroll = document.getElementById('fileListScroll');
        const clearFilesBtn = document.getElementById('clearFilesBtn');
        const uploadBtn = document.getElementById('uploadBtn');
        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');
        const progressSize = document.getElementById('progressSize');
        const progressEta = document.getElementById('progressEta');
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        const resultCid = document.getElementById('resultCid');
        const resultLink = document.getElementById('resultLink');
        const openLinkBtn = document.getElementById('openLinkBtn');
        const copyCidBtn = document.getElementById('copyCidBtn');
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        const newUploadBtn = document.getElementById('newUploadBtn');
        const errorTitle = document.getElementById('errorTitle');
        const errorMessage = document.getElementById('errorMessage');
        const retryBtn = document.getElementById('retryBtn');
        const backToDropBtn = document.getElementById('backToDropBtn');

        if (!stateDropZone) return;

        let selectedFiles = []; // Array of { file: File, path: string }
        let abortController = null;

        // --- State switching ---
        function showState(state) {
            [stateDropZone, stateFilePreview, stateUploading, stateSuccess, stateError].forEach(function (el) {
                el.style.display = 'none';
            });
            state.style.display = 'block';
        }

        // --- Format helpers ---
        function fmtBytes(b) {
            if (typeof PinataAPI !== 'undefined') return PinataAPI.formatBytes(b);
            if (b === 0) return '0 B';
            var s = ['B','KB','MB','GB']; var i = Math.floor(Math.log(b)/Math.log(1024));
            return (b/Math.pow(1024,i)).toFixed(i>1?2:0)+' '+s[i];
        }

        function fmtTime(seconds) {
            if (!seconds || seconds < 0) return 'Estimating…';
            if (seconds < 60) return Math.ceil(seconds) + 's remaining';
            return Math.ceil(seconds / 60) + 'min remaining';
        }

        function fileIcon(name) {
            var ext = (name.split('.').pop() || '').toLowerCase();
            if (['html','htm'].indexOf(ext) !== -1) return '🌐';
            if (['css'].indexOf(ext) !== -1) return '🎨';
            if (['js','ts'].indexOf(ext) !== -1) return '⚙️';
            if (['png','jpg','jpeg','gif','svg','webp'].indexOf(ext) !== -1) return '🖼️';
            if (['json'].indexOf(ext) !== -1) return '📋';
            if (['md','txt'].indexOf(ext) !== -1) return '📄';
            return '📁';
        }

        // --- Read directory entries recursively (for drag & drop folders) ---
        function readEntries(dirReader) {
            return new Promise(function (resolve) {
                var all = [];
                (function read() {
                    dirReader.readEntries(function (entries) {
                        if (entries.length === 0) { resolve(all); return; }
                        all = all.concat(Array.from(entries));
                        read();
                    });
                })();
            });
        }

        function readEntryRecursive(entry, basePath) {
            return new Promise(function (resolve) {
                if (entry.isFile) {
                    entry.file(function (file) {
                        resolve([{ file: file, path: basePath + file.name }]);
                    });
                } else if (entry.isDirectory) {
                    var dirReader = entry.createReader();
                    readEntries(dirReader).then(function (entries) {
                        var promises = entries.map(function (e) {
                            return readEntryRecursive(e, basePath + entry.name + '/');
                        });
                        Promise.all(promises).then(function (results) {
                            resolve([].concat.apply([], results));
                        });
                    });
                } else {
                    resolve([]);
                }
            });
        }

        async function getFilesFromDrop(dataTransfer) {
            var items = dataTransfer.items;
            var files = [];
            if (items && items.length > 0 && items[0].webkitGetAsEntry) {
                var entries = [];
                for (var i = 0; i < items.length; i++) {
                    var entry = items[i].webkitGetAsEntry();
                    if (entry) entries.push(entry);
                }
                for (var j = 0; j < entries.length; j++) {
                    var result = await readEntryRecursive(entries[j], '');
                    files = files.concat(result);
                }
            } else {
                var fList = dataTransfer.files;
                for (var k = 0; k < fList.length; k++) {
                    files.push({ file: fList[k], path: fList[k].name });
                }
            }
            return files;
        }

        function getFilesFromInput(inputFiles, isFolder) {
            var files = [];
            for (var i = 0; i < inputFiles.length; i++) {
                var f = inputFiles[i];
                var path = f.webkitRelativePath || f.name;
                files.push({ file: f, path: path });
            }
            return files;
        }

        // --- Render file list ---
        function renderFileList() {
            var total = 0;
            fileListScroll.innerHTML = '';
            selectedFiles.forEach(function (entry) {
                total += entry.file.size;
                var div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML =
                    '<span class="file-item-icon">' + fileIcon(entry.file.name) + '</span>' +
                    '<div class="file-item-info">' +
                        '<div class="file-item-name">' + entry.file.name + '</div>' +
                        (entry.path !== entry.file.name ? '<div class="file-item-path">' + entry.path + '</div>' : '') +
                    '</div>' +
                    '<span class="file-item-size">' + fmtBytes(entry.file.size) + '</span>';
                fileListScroll.appendChild(div);
            });
            fileMeta.textContent = selectedFiles.length + ' file' + (selectedFiles.length !== 1 ? 's' : '') + ' · ' + fmtBytes(total);

            // Sync pin name between the two inputs
            if (pinNameInput2) pinNameInput2.value = pinNameInput.value;
        }

        function setFiles(files) {
            if (!files || files.length === 0) return;
            selectedFiles = files;
            renderFileList();
            showState(stateFilePreview);
        }

        // --- Drag & drop events ---
        var dragCounter = 0;

        dropZone.addEventListener('dragenter', function (e) {
            e.preventDefault();
            dragCounter++;
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
        });

        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) { dragCounter = 0; dropZone.classList.remove('drag-over'); }
        });

        dropZone.addEventListener('drop', async function (e) {
            e.preventDefault();
            dragCounter = 0;
            dropZone.classList.remove('drag-over');
            var files = await getFilesFromDrop(e.dataTransfer);
            setFiles(files);
        });

        // Click on drop zone inner
        document.getElementById('dropZoneInner').addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            fileInput.click();
        });

        // --- File & folder input buttons ---
        selectFilesBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
        selectFolderBtn.addEventListener('click', function (e) { e.stopPropagation(); folderInput.click(); });

        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) {
                setFiles(getFilesFromInput(fileInput.files, false));
                fileInput.value = '';
            }
        });

        folderInput.addEventListener('change', function () {
            if (folderInput.files.length > 0) {
                setFiles(getFilesFromInput(folderInput.files, true));
                folderInput.value = '';
            }
        });

        // --- Clear files ---
        clearFilesBtn.addEventListener('click', function () {
            selectedFiles = [];
            showState(stateDropZone);
        });

        // --- Upload ---
        uploadBtn.addEventListener('click', function () {
            startUpload();
        });

        async function startUpload() {
            if (selectedFiles.length === 0) return;

            var active = getActiveKey();
            if (!active) return;

            // Sync pin name
            var pinName = (pinNameInput2 ? pinNameInput2.value : pinNameInput.value) || '';

            // Show uploading state
            showState(stateUploading);
            progressFill.style.width = '0%';
            progressPercent.textContent = '0 %';
            progressSize.textContent = '0 / 0';
            progressEta.textContent = 'Estimating…';

            abortController = new AbortController();

            try {
                var result = await PinataAPI.upload(selectedFiles, {
                    apiKey: active.key,
                    pinName: pinName.trim(),
                    abortController: abortController,
                    onProgress: function (p) {
                        progressFill.style.width = p.percent + '%';
                        progressPercent.textContent = p.percent + ' %';
                        progressSize.textContent = fmtBytes(p.loaded) + ' / ' + fmtBytes(p.total);
                        progressEta.textContent = fmtTime(p.eta);
                    }
                });

                // Success
                showState(stateSuccess);
                resultCid.textContent = result.cid;
                resultLink.textContent = result.gatewayUrl;
                resultLink.href = result.gatewayUrl;
                openLinkBtn.href = result.gatewayUrl;

                // --- Persist to IPFS index (if wallet connected) ---
                if (typeof IpfsIndex !== 'undefined' && typeof WalletAuth !== 'undefined' && WalletAuth.isConnected()) {
                    var uploadName = pinName || (selectedFiles.length === 1 ? selectedFiles[0].file.name : 'upload');
                    var totalSize = 0;
                    for (var s = 0; s < selectedFiles.length; s++) totalSize += selectedFiles[s].file.size;
                    var ext = (uploadName.split('.').pop() || '').toLowerCase();
                    var ftype = 'other';
                    if (['html','htm'].indexOf(ext) !== -1) ftype = 'html';
                    else if (['png','jpg','jpeg','gif','svg','webp','ico'].indexOf(ext) !== -1) ftype = 'image';
                    else if (['js','ts','mjs'].indexOf(ext) !== -1) ftype = 'js';
                    else if (['css','scss','less'].indexOf(ext) !== -1) ftype = 'css';

                    var fileInfo = {
                        name: uploadName,
                        cid: result.cid,
                        size: result.size || totalSize,
                        date: new Date().toISOString(),
                        gateway: result.gatewayUrl,
                        type: ftype
                    };

                    // Fire-and-forget: persist to IPFS index
                    IpfsIndex.addFile(fileInfo, active.provider, active.key, WalletAuth.getAddress()).catch(function (e) {
                        console.warn('Index persist failed:', e);
                    });
                }

            } catch (err) {
                if (err && err.type === 'abort') return; // user cancelled

                showState(stateError);
                if (err && err.type === 'auth') {
                    errorTitle.textContent = 'API Key Expired';
                    errorMessage.textContent = err.message;
                } else if (err && err.type === 'network') {
                    errorTitle.textContent = 'Connection Lost';
                    errorMessage.textContent = err.message + ' You can retry when back online.';
                } else {
                    errorTitle.textContent = 'Upload Failed';
                    errorMessage.textContent = err && err.message ? err.message : 'An unexpected error occurred.';
                }
            }

            abortController = null;
        }

        // --- Cancel upload ---
        cancelUploadBtn.addEventListener('click', function () {
            if (abortController) abortController.abort();
            showState(stateFilePreview);
        });

        // --- Result actions ---
        copyCidBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(resultCid.textContent).then(function () {
                copyCidBtn.textContent = '✓';
                setTimeout(function () { copyCidBtn.textContent = '📋'; }, 1500);
            });
        });

        copyLinkBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(resultLink.textContent).then(function () {
                copyLinkBtn.textContent = '✓';
                setTimeout(function () { copyLinkBtn.textContent = '📋'; }, 1500);
            });
        });

        newUploadBtn.addEventListener('click', function () {
            selectedFiles = [];
            pinNameInput.value = '';
            showState(stateDropZone);
        });

        // --- Error actions ---
        retryBtn.addEventListener('click', function () {
            startUpload();
        });

        backToDropBtn.addEventListener('click', function () {
            showState(stateFilePreview);
        });

        // Show drop zone by default
        showState(stateDropZone);
    }


    console.log('%c🚀 Web3Deploy loaded', 'color: #00ff88; font-weight: bold;');
})();
