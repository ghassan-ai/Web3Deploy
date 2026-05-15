// ============================================
// Web3Deploy — Wallet Authentication Module
// ============================================

var WalletAuth = (function () {
    'use strict';

    const WALLET_KEY = 'web3deploy_wallet';
    const SIGN_PREFIX = 'Sign in to Web3Deploy: ';

    // --- State ---
    let connectedAddress = null;
    let isConnecting = false;

    // --- DOM refs (set on init) ---
    let connectBtn = null;
    let walletBtnText = null;
    let walletBtnIcon = null;
    let walletDisconnectBtn = null;

    // ============================================
    // Helpers
    // ============================================

    /**
     * Truncate wallet address: 0x1234...5678
     */
    function truncateAddress(addr) {
        if (!addr || addr.length < 10) return addr;
        return addr.slice(0, 6) + '…' + addr.slice(-4);
    }

    /**
     * Check if MetaMask / window.ethereum is available
     */
    function hasEthereum() {
        return !!getEthereumProvider();
    }

    function getEthereumProvider() {
        if (typeof window.ethereum !== 'undefined') return window.ethereum;
        if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) return window.web3.currentProvider;
        return null;
    }

    function canRequest(provider) {
        return !!(provider && (provider.request || provider.sendAsync || provider.send));
    }

    function ethereumRequest(method, params) {
        var provider = getEthereumProvider();
        if (!provider) return Promise.reject(new Error('No Ethereum provider'));

        if (provider.request) {
            return provider.request({ method: method, params: params || [] });
        }

        return new Promise(function (resolve, reject) {
            var payload = { id: Date.now(), jsonrpc: '2.0', method: method, params: params || [] };

            if (provider.sendAsync) {
                provider.sendAsync(payload, function (err, res) {
                    if (err) return reject(err);
                    resolve(res && res.result);
                });
                return;
            }

            if (provider.send) {
                try {
                    var res = provider.send(payload, function (err, resAsync) {
                        if (err) return reject(err);
                        resolve(resAsync && resAsync.result);
                    });
                    if (res && typeof res.then === 'function') {
                        res.then(function (r) { resolve(r && r.result !== undefined ? r.result : r); }).catch(reject);
                        return;
                    }
                    if (res && res.result !== undefined) return resolve(res.result);
                } catch (err) {
                    return reject(err);
                }
            }

            reject(new Error('Ethereum provider does not support request'));
        });
    }

    function hasEthers() {
        return typeof ethers !== 'undefined' && ethers.BrowserProvider;
    }

    async function requestWalletSignature() {
        var message = SIGN_PREFIX + Date.now();

        if (hasEthers()) {
            var provider = new ethers.BrowserProvider(window.ethereum);
            var signer = await provider.getSigner();
            var address = await signer.getAddress();
            var signature = await signer.signMessage(message);
            return { address: address, signature: signature };
        }

        var accounts = await ethereumRequest('eth_requestAccounts');
        var address = accounts && accounts[0];
        if (!address) throw new Error('No accounts');
        var signature = await ethereumRequest('personal_sign', [message, address]);
        return { address: address, signature: signature };
    }

    // ============================================
    // UI Updates
    // ============================================

    function updateUI(address) {
        if (!connectBtn) return;

        if (address) {
            connectedAddress = address;
            walletBtnIcon.textContent = '🟢';
            walletBtnText.textContent = truncateAddress(address);
            connectBtn.classList.add('wallet-connected');
            connectBtn.title = address;

            // Show disconnect button
            if (walletDisconnectBtn) {
                walletDisconnectBtn.style.display = 'flex';
            }
        } else {
            connectedAddress = null;
            walletBtnIcon.textContent = '🦊';
            walletBtnText.textContent = 'Connect Wallet';
            connectBtn.classList.remove('wallet-connected');
            connectBtn.title = 'Connect MetaMask wallet';

            // Hide disconnect button
            if (walletDisconnectBtn) {
                walletDisconnectBtn.style.display = 'none';
            }
        }
    }

    function showConnecting() {
        if (!connectBtn) return;
        walletBtnIcon.innerHTML = '<span class="wallet-spinner"></span>';
        walletBtnText.textContent = 'Connecting…';
        connectBtn.disabled = true;
    }

    function resetButton() {
        if (!connectBtn) return;
        connectBtn.disabled = false;
    }

    // ============================================
    // Core Logic
    // ============================================

    /**
     * Connect wallet via MetaMask (window.ethereum)
     */
    async function connect() {
        if (isConnecting) return;

        // Check for MetaMask
        var provider = getEthereumProvider();
        if (!provider || !canRequest(provider)) {
            showWalletToast('MetaMask not detected. Please install the MetaMask extension.', 'error');
            return;
        }

        isConnecting = true;
        showConnecting();

        try {
            // Request account access + signature
            var result = await requestWalletSignature();
            var address = result.address;
            var signature = result.signature;

            if (!signature) {
                throw new Error('Signature rejected');
            }

            // Save to localStorage
            localStorage.setItem(WALLET_KEY, address);
            connectedAddress = address;

            // Update UI
            updateUI(address);
            showWalletToast('Wallet connected: ' + truncateAddress(address), 'success');

            console.log('%c🦊 Wallet connected: ' + address, 'color: #00ff88; font-weight: bold;');

        } catch (err) {
            console.warn('Wallet connection failed:', err);

            if (err.code === 4001 || (err.info && err.info.error && err.info.error.code === 4001)) {
                showWalletToast('Wallet connection cancelled. You can use an API key instead.', 'info');
            } else if (err.code === -32002) {
                showWalletToast('MetaMask is already processing a request. Check the extension.', 'error');
            } else {
                showWalletToast('Wallet connection failed. Please try again.', 'error');
            }

            updateUI(null);
        } finally {
            isConnecting = false;
            resetButton();
        }
    }

    /**
     * Disconnect wallet (clear state)
     */
    function disconnect() {
        localStorage.removeItem(WALLET_KEY);
        connectedAddress = null;
        updateUI(null);
        showWalletToast('Wallet disconnected.', 'info');
    }

    /**
     * Auto-reconnect on page load if wallet was previously saved
     */
    async function autoReconnect() {
        const savedAddress = localStorage.getItem(WALLET_KEY);
        if (!savedAddress || !hasEthereum()) return;

        try {
            // Silently check if the account is still available
            const accounts = await ethereumRequest('eth_accounts');

            if (accounts && accounts.length > 0) {
                // Find matching address
                const match = accounts.find(
                    a => a.toLowerCase() === savedAddress.toLowerCase()
                );

                if (match) {
                    connectedAddress = match;
                    updateUI(match);
                    console.log('%c🦊 Wallet auto-reconnected: ' + match, 'color: #00ff88;');
                } else {
                    // Saved address not among current accounts
                    localStorage.removeItem(WALLET_KEY);
                    updateUI(null);
                }
            } else {
                // No accounts available (locked or disconnected)
                // Keep the saved address but show as disconnected visually
                updateUI(null);
            }
        } catch (err) {
            console.warn('Auto-reconnect failed:', err);
            updateUI(null);
        }
    }

    // ============================================
    // Account Change Listener
    // ============================================

    function listenForAccountChanges() {
        var provider = getEthereumProvider();
        if (!provider || !provider.on) return;

        provider.on('accountsChanged', function (accounts) {
            if (accounts.length === 0) {
                // User disconnected from MetaMask
                disconnect();
            } else {
                const newAddress = accounts[0];
                localStorage.setItem(WALLET_KEY, newAddress);
                connectedAddress = newAddress;
                updateUI(newAddress);
                showWalletToast('Switched to ' + truncateAddress(newAddress), 'info');
            }
        });

        provider.on('chainChanged', function () {
            // Reload on chain change as recommended by MetaMask
            window.location.reload();
        });
    }

    // ============================================
    // Toast Notification
    // ============================================

    function showWalletToast(message, type) {
        // Remove any existing toast
        const existing = document.getElementById('walletToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'walletToast';
        toast.className = 'wallet-toast wallet-toast-' + type;

        const icons = { success: '✓', error: '✕', info: 'ℹ' };

        toast.innerHTML =
            '<span class="wallet-toast-icon">' + (icons[type] || 'ℹ') + '</span>' +
            '<span class="wallet-toast-msg">' + message + '</span>';

        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(function () {
            toast.classList.add('visible');
        });

        // Auto-dismiss
        setTimeout(function () {
            toast.classList.remove('visible');
            setTimeout(function () {
                if (toast.parentNode) toast.remove();
            }, 400);
        }, 3500);
    }

    // ============================================
    // Initialize
    // ============================================

    function init() {
        // --- Navbar wallet button ---
        connectBtn = document.getElementById('walletConnectBtn');
        walletBtnText = document.getElementById('walletBtnText');
        walletBtnIcon = document.getElementById('walletBtnIcon');
        walletDisconnectBtn = document.getElementById('walletDisconnectBtn');

        // --- Setup screen elements ---
        var setupWalletBtn = document.getElementById('setupWalletBtn');
        var setupWalletStatus = document.getElementById('setupWalletStatus');
        var setupApikeyToggle = document.getElementById('setupApikeyToggle');
        var setupApikeyForm = document.getElementById('setupApikeyForm');

        // --- Navbar wallet button click ---
        if (connectBtn) {
            connectBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (connectedAddress) {
                    navigator.clipboard.writeText(connectedAddress).then(function () {
                        showWalletToast('Address copied to clipboard!', 'success');
                    });
                } else {
                    connect();
                }
            });
        }

        // --- Disconnect button ---
        if (walletDisconnectBtn) {
            walletDisconnectBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                disconnect();
            });
        }

        // --- Setup screen: MetaMask button ---
        if (setupWalletBtn) {
            setupWalletBtn.addEventListener('click', async function () {
                if (isConnecting) return;

                var provider = getEthereumProvider();
                if (!provider || !canRequest(provider)) {
                    if (setupWalletStatus) {
                        setupWalletStatus.innerHTML =
                            '<span style="color:#ff5566">⚠️ MetaMask not detected. Please install the ' +
                            '<a href="https://metamask.io/download/" target="_blank" rel="noopener" style="color:#0066ff;text-decoration:underline">MetaMask extension</a>' +
                            ' and reload the page.</span>';
                    }
                    return;
                }

                // Show loading state on setup button
                setupWalletBtn.disabled = true;
                var origTitle = setupWalletBtn.querySelector('.setup-wallet-btn-title');
                var origSub = setupWalletBtn.querySelector('.setup-wallet-btn-sub');
                if (origTitle) origTitle.textContent = 'Connecting…';
                if (origSub) origSub.textContent = 'Please confirm in MetaMask';
                if (setupWalletStatus) setupWalletStatus.textContent = '';

                isConnecting = true;

                try {
                    var result = await requestWalletSignature();
                    var address = result.address;
                    var signature = result.signature;

                    if (!signature) throw new Error('Signature rejected');

                    // Save wallet
                    localStorage.setItem(WALLET_KEY, address);
                    connectedAddress = address;

                    // Update navbar
                    updateUI(address);

                    // Show success on setup
                    if (origTitle) origTitle.textContent = '✓ Connected';
                    if (origSub) origSub.textContent = truncateAddress(address);

                    showWalletToast('Wallet connected: ' + truncateAddress(address), 'success');
                    console.log('%c🦊 Wallet connected: ' + address, 'color: #00ff88; font-weight: bold;');

                    // Transition to dashboard after brief delay
                    setTimeout(function () {
                        var setupScreen = document.getElementById('setupScreen');
                        var dashboardContent = document.getElementById('dashboardContent');
                        if (setupScreen) setupScreen.style.display = 'none';
                        if (dashboardContent) dashboardContent.classList.add('active');
                    }, 800);

                } catch (err) {
                    console.warn('Wallet connection failed:', err);

                    if (origTitle) origTitle.textContent = 'Connect with MetaMask';
                    if (origSub) origSub.textContent = 'Sign in with your wallet — no API key needed';

                    if (err.code === 4001 || (err.info && err.info.error && err.info.error.code === 4001)) {
                        if (setupWalletStatus) setupWalletStatus.innerHTML = '<span style="color:#ff5566">Connection rejected by user.</span>';
                    } else if (err.code === -32002) {
                        if (setupWalletStatus) setupWalletStatus.innerHTML = '<span style="color:#ffaa33">MetaMask is already processing. Check the extension.</span>';
                    } else {
                        if (setupWalletStatus) setupWalletStatus.innerHTML = '<span style="color:#ff5566">Connection failed. Please try again.</span>';
                    }
                } finally {
                    isConnecting = false;
                    setupWalletBtn.disabled = false;
                }
            });
        }

        // --- Setup screen: API Key toggle ---
        if (setupApikeyToggle && setupApikeyForm) {
            setupApikeyToggle.addEventListener('click', function () {
                var isOpen = setupApikeyForm.style.display !== 'none';
                setupApikeyForm.style.display = isOpen ? 'none' : 'block';
                setupApikeyToggle.classList.toggle('open', !isOpen);
            });
        }

        // Listen for account changes
        listenForAccountChanges();

        // Auto-reconnect
        autoReconnect();
    }

    // ============================================
    // Public API
    // ============================================

    return {
        init: init,
        connect: connect,
        disconnect: disconnect,
        getAddress: function () { return connectedAddress; },
        isConnected: function () { return !!connectedAddress; },
        truncateAddress: truncateAddress
    };

})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    WalletAuth.init();
});
