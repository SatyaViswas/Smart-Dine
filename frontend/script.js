// Initialize Icons
lucide.createIcons();

// --- STATE MANAGEMENT ---
const API_HOST = window.location.hostname || '127.0.0.1';

const BASE_URL = 'https://smart-dine-oyaw.onrender.com/api';
// --- AUTHENTICATION LOGIC (LOGIN & SIGNUP) ---
const authScreen = document.getElementById('auth-screen');
const appContent = document.getElementById('app-content');
const navBar = document.querySelector('.nav-floating');

let isLoginMode = true; // Tracks whether we are logging in or signing up
let isStaffMode = false; // Tracks whether the active role is Staff or Student

// Check if user is already logged in
const savedRole = localStorage.getItem('userRole');
const savedRollNo = localStorage.getItem('userRollNo');
const savedEmail = localStorage.getItem('userEmail');
const savedStaffShop = localStorage.getItem('staffShop');

if (savedRole === 'student' && savedRollNo) {
    completeLogin('student', savedRollNo);
} else if (savedRole === 'staff' && savedEmail) {
    if (!savedStaffShop) {
        localStorage.setItem('staffShop', 'Meals');
    }
    completeLogin('staff', savedEmail);
} else {
    appContent.style.display = 'none';
    navBar.style.display = 'none';
}

// --- ROLE TOGGLE LISTENERS ---
document.getElementById('role-student-btn').addEventListener('click', () => {
    isStaffMode = false;
    document.getElementById('role-student-btn').style.cssText =
        'flex:1;padding:0.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;font-size:0.85rem;transition:all 0.2s;background:var(--sd-accent-violet);color:#fff;';
    document.getElementById('role-staff-btn').style.cssText =
        'flex:1;padding:0.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;font-size:0.85rem;transition:all 0.2s;background:transparent;color:var(--sd-text-muted);';
    document.getElementById('auth-error').style.display = 'none';
    updateAuthForm();
});

document.getElementById('role-staff-btn').addEventListener('click', () => {
    isStaffMode = true;
    document.getElementById('role-staff-btn').style.cssText =
        'flex:1;padding:0.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;font-size:0.85rem;transition:all 0.2s;background:var(--sd-accent-violet);color:#fff;';
    document.getElementById('role-student-btn').style.cssText =
        'flex:1;padding:0.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;font-size:0.85rem;transition:all 0.2s;background:transparent;color:var(--sd-text-muted);';
    document.getElementById('auth-error').style.display = 'none';
    updateAuthForm();
});

// Handle switching between Login and Sign Up
document.getElementById('auth-switch-btn').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-error').style.display = 'none';
    updateAuthForm();
});

function updateAuthForm() {
    const isLogin = isLoginMode;
    const isStaff = isStaffMode;

    document.getElementById('auth-title').textContent = isStaff
        ? (isLogin ? 'Staff Login' : 'Staff Registration')
        : (isLogin ? 'Smart-Dine Login' : 'Create Account');
    document.getElementById('auth-subtitle').textContent = isStaff
        ? (isLogin ? 'Sign in with your staff email' : 'Create a staff account')
        : (isLogin ? 'Enter your College Roll Number' : 'Register for Smart-Dine Campus');

    document.getElementById('auth-roll-no').style.display = isStaff ? 'none' : 'block';
    document.getElementById('auth-email').style.display = isStaff ? 'block' : 'none';
    document.getElementById('auth-password').style.display = isStaff ? 'block' : 'none';
    document.getElementById('auth-staff-shop').style.display = (isStaff && !isLogin) ? 'block' : 'none';
    document.getElementById('auth-confirm-password').style.display = (isStaff && !isLogin) ? 'block' : 'none';

    document.getElementById('auth-btn-text').textContent = isLogin ? 'Access Dashboard' : 'Create Account';
    document.getElementById('auth-switch-text').textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
    document.getElementById('auth-switch-btn').textContent = isLogin ? 'Sign Up' : 'Log In';
}

// Handle the Form Submission
document.getElementById('auth-btn').addEventListener('click', async () => {
    const btnText = document.getElementById('auth-btn-text');
    const originalText = btnText.textContent;
    document.getElementById('auth-error').style.display = 'none';

    if (isStaffMode) {
        // --- STAFF AUTH FLOW ---
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!email || !password) { showAuthError('Email and password are required.'); return; }

        let signupShop = null;
        if (!isLoginMode) {
            const confirmPwd = document.getElementById('auth-confirm-password').value;
            if (password !== confirmPwd) { showAuthError('Passwords do not match.'); return; }
            signupShop = document.getElementById('auth-staff-shop').value;
        }

        btnText.textContent = 'Processing...';
        try {
            const endpoint = isLoginMode ? '/staff/login' : '/staff/signup';
            const payload = isLoginMode
                ? { email, password }
                : { email, password, shop: signupShop };

            const res = await fetch(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('userRole', 'staff');
                localStorage.setItem('userEmail', email);
                localStorage.setItem('staffShop', data.shop || signupShop || 'Meals');
                completeLogin('staff', email);
            } else {
                showAuthError(Array.isArray(data.detail)
                    ? 'Server Error - ' + data.detail.map(e => `${e.loc[1]}: ${e.msg}`).join(', ')
                    : (data.detail || 'Authentication failed.'));
            }
        } catch (e) {
            showAuthError('Server offline. Please check your connection.');
        } finally {
            if (authScreen.style.display !== 'none') btnText.textContent = originalText;
        }
    } else {
        // --- STUDENT AUTH FLOW ---
        const rollNoInput = document.getElementById('auth-roll-no').value.trim();
        if (!rollNoInput) { showAuthError('Roll Number is required.'); return; }
        btnText.textContent = 'Processing...';
        try {
            const endpoint = isLoginMode ? '/login' : '/signup';
            const res = await fetch(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roll_no: rollNoInput })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('userRole', 'student');
                localStorage.setItem('userRollNo', data.roll_no);
                completeLogin('student', data.roll_no);
            } else {
                showAuthError(Array.isArray(data.detail)
                    ? 'Server Error - ' + data.detail.map(e => `${e.loc[1]}: ${e.msg}`).join(', ')
                    : (data.detail || 'Authentication failed.'));
            }
        } catch (e) {
            showAuthError('Server offline. Please check your connection.');
        } finally {
            if (authScreen.style.display !== 'none') btnText.textContent = originalText;
        }
    }
});

function showAuthError(message) {
    const errorMsg = document.getElementById('auth-error');
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

function completeLogin(role, identifier) {
    authScreen.style.display = 'none';
    appContent.style.display = 'block';

    if (role === 'staff') {
        navBar.style.display = 'none';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('planner').style.display = 'none';
        document.getElementById('kds').style.display = 'block';
        const assignedShop = localStorage.getItem('staffShop') || 'Meals';
        document.getElementById('kds-shop-title').innerText = `${assignedShop} KDS`;

        // Show Manage Menu section only for Meals and Beverages
        const menuSection = document.getElementById('manage-menu-section');
        if (menuSection) {
            if (assignedShop === 'Meals' || assignedShop === 'Beverages') {
                menuSection.style.display = 'block';
                loadMenuItems(assignedShop);
            } else {
                menuSection.style.display = 'none';
            }
        }
    } else {
        navBar.style.display = 'flex';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('planner').style.display = 'none';
        document.getElementById('kds').style.display = 'none';
        document.querySelector('.dashboard-header h1').textContent = 'Welcome, Student';
        document.querySelector('.dashboard-header p').textContent = `Smart-Dine Campus Canteen | ${identifier}`;
        document.querySelector('.avatar').textContent = 'ST';
    }
}

document.querySelector('.avatar').addEventListener('click', () => {
    if (confirm("Do you want to logout?")) {
        localStorage.clear();
        location.reload();
    }
});

document.getElementById('staff-logout-btn').addEventListener('click', () => {
    if (confirm("Do you want to logout?")) {
        localStorage.clear();
        location.reload();
    }
});
let currentShop = 'Meals';
let shopDataCache = { "Meals": null, "Snacks": null, "Beverages": null };
let shopStatuses = { "Meals": true, "Snacks": true, "Beverages": true };
const statusCache = {};
let dashboardRequestSeq = 0;
let myActiveShops = new Set();
const orderShops = ['Meals', 'Snacks', 'Beverages'];
const servedNoticeExpiryByShop = { Meals: 0, Snacks: 0, Beverages: 0 };
const seenCompletedOrderKeys = new Set();
let completedBootstrapDone = false;

function updateButtonStates() {
    const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;
    const joinBtn = document.getElementById('join-btn') || document.getElementById('join-queue-btn');
    const scanBtn = document.getElementById('scan-barcode-btn');

    if (!joinBtn) {
        return;
    }

    if (shopStatuses[selectedShop] === false) {
        joinBtn.disabled = true;
        joinBtn.innerText = 'Station Paused';
        joinBtn.classList.add('btn-disabled');
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.classList.add('btn-disabled');
        }
        return;
    }

    if (myActiveShops.has(selectedShop)) {
        joinBtn.disabled = true;
        joinBtn.innerText = `Already in ${selectedShop} Queue`;
        joinBtn.classList.add('btn-disabled');
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.classList.add('btn-disabled');
        }
    } else {
        joinBtn.disabled = false;
        joinBtn.innerText = "Join Queue";
        joinBtn.classList.remove('btn-disabled');
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.classList.remove('btn-disabled');
        }
    }
}

function syncStaffPauseButton() {
    const btn = document.getElementById('staff-pause-btn');
    if (!btn) {
        return;
    }
    const shop = localStorage.getItem('staffShop') || 'Meals';
    const isActive = shopStatuses[shop] !== false;
    if (isActive) {
        btn.style.backgroundColor = '#10b981';
        btn.innerText = 'Accepting Orders';
    } else {
        btn.style.backgroundColor = '#ef4444';
        btn.innerText = 'STATION PAUSED';
    }
}

function formatWaitTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds)) return "0s";
    totalSeconds = Math.round(totalSeconds);

    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    } else if (totalSeconds < 3600) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    } else {
        const hours = Math.floor(totalSeconds / 3600);
        const remainingSeconds = totalSeconds % 3600;
        const minutes = Math.floor(remainingSeconds / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
    }
    return res.json();
}

// --- ROUTING / NAVIGATION (Kept from your original) ---
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page-view');
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        navLinks.forEach(n => n.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const targetId = e.currentTarget.getAttribute('data-target');
        pages.forEach(page => page.style.display = page.id === targetId ? 'block' : 'none');
        // Refresh data when switching tabs
        if (targetId === 'dashboard') updateDashboardUI();
        if (targetId === 'orders') fetchMyOrders();
        if (targetId === 'kds') renderOrders();
    });
});

// --- LIVE DASHBOARD LOGIC ---
const shopTabs = document.querySelectorAll('.shop-tab');

function cacheShopStatus(shopName, data) {
    const existing = shopDataCache[shopName] && typeof shopDataCache[shopName] === 'object'
        ? shopDataCache[shopName]
        : {};
    shopDataCache[shopName] = { ...existing, status: data };
}

function cacheShopOrders(shopName, ordersByShop) {
    const existing = shopDataCache[shopName] && typeof shopDataCache[shopName] === 'object'
        ? shopDataCache[shopName]
        : {};
    shopDataCache[shopName] = { ...existing, orders: ordersByShop };
}

function renderOrdersForSingleShop(shop, ordersByShop) {
    const shopId = normalizeShopId(shop);
    const activeListEl = document.getElementById(`active-orders-list-${shopId}`);
    const completedListEl = document.getElementById(`completed-orders-list-${shopId}`);
    if (!activeListEl || !completedListEl) {
        return;
    }

    const activeOrders = Array.isArray(ordersByShop?.active) ? ordersByShop.active : [];
    const completedOrders = Array.isArray(ordersByShop?.completed) ? ordersByShop.completed : [];

    if (activeOrders.length > 0) {
        myActiveShops.add(shop);
    } else {
        myActiveShops.delete(shop);
    }

    activeListEl.innerHTML = activeOrders.length
        ? activeOrders.map(() => {
            return `<li class="order-item preparing">
                        <span style="font-weight: bold;">${shop}</span>
                        <span class="badge preparing">Preparing</span>
                    </li>`;
        }).join('')
        : '<li style="color: #999; font-size: 0.9rem;">No active orders.</li>';

    completedListEl.innerHTML = completedOrders.length
        ? completedOrders.map((order) => {
            const servedTime = formatServedTime(order.time_served || order.timestamp);
            return `<li class="order-item served">
                        <div style="flex-grow: 1;">
                            <div style="font-weight: bold;">${shop}</div>
                            <div style="font-size: 0.75rem; color: #999; margin-top: 2px;">Served at ${servedTime || '--'}</div>
                        </div>
                        <span class="badge served">Served</span>
                    </li>`;
        }).join('')
        : '<li style="color: #999; font-size: 0.9rem;">No recently served orders.</li>';
}

function renderFromCache(shop) {
    const cached = shopDataCache[shop];
    if (!cached || typeof cached !== 'object') {
        return;
    }

    if (cached.status) {
        renderDashboardData(shop, cached.status);
    }

    if (cached.orders) {
        renderOrdersForSingleShop(shop, cached.orders);
        updateButtonStates();
    }
}

shopTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        // 1) Update visual state immediately
        shopTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        // 2) Update selected shop state
        currentShop = e.target.getAttribute('data-shop');
        const selector = document.getElementById('student-shop-selector');
        if (selector) {
            selector.value = currentShop;
        }

        // 3) Render immediately from local cache if present
        renderShopChrome(currentShop);
        if (shopDataCache[currentShop]) {
            renderFromCache(currentShop);
        }

        // 4) Refresh in background without blocking tab switch
        updateDashboardUI({ shop: currentShop, silent: true });
        fetchMyOrders();
        updateLiveOrderTracker();

        // 5) Fetch live menu for this shop (Meals/Beverages only)
        fetchStudentMenu(currentShop);
    });
});

const studentShopSelector = document.getElementById('student-shop-selector');
if (studentShopSelector) {
    studentShopSelector.value = currentShop;
    studentShopSelector.addEventListener('change', (e) => {
        // 1) Update visual state immediately
        currentShop = e.target.value;
        shopTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.getAttribute('data-shop') === currentShop);
        });

        // 2) Update selected shop state is done above via currentShop

        // 3) Render immediately from local cache if present
        renderShopChrome(currentShop);
        if (shopDataCache[currentShop]) {
            renderFromCache(currentShop);
        }

        // 4) Refresh in background without blocking tab switch
        updateDashboardUI({ shop: currentShop, silent: true });
        fetchMyOrders();
        updateButtonStates();
    });

    studentShopSelector.addEventListener('change', updateButtonStates);
}

function renderShopChrome(shop) {
    document.getElementById('seats-card').style.display = 'block';
}

function renderDashboardData(shop, data) {
    const avgSpeedSeconds = Number.isFinite(data.avg_speed_seconds) ? Math.max(0, data.avg_speed_seconds) : 0;
    const formattedAvgSpeed = formatWaitTime(avgSpeedSeconds);
    // Calculate time for current queue PLUS the user's own order
    const rawWaitSeconds = Number.isFinite(data.queue) ? (Math.max(0, data.queue) + 1) * avgSpeedSeconds : avgSpeedSeconds;

    document.getElementById('queue-val').textContent = data.queue;
    const waitValueEl = document.getElementById('wait-val');
    waitValueEl.textContent = formatWaitTime(rawWaitSeconds);
    if (waitValueEl.nextElementSibling) {
        waitValueEl.nextElementSibling.textContent = '';
    }
    document.getElementById('kds-avg-speed').textContent = formattedAvgSpeed;

    const seatsCard = document.getElementById('seats-card');
    seatsCard.style.display = 'block';
    document.getElementById('seats-val').textContent = data.seats;
    document.getElementById('seat-text').textContent = data.seats;
    const offset = (2 * Math.PI * 28) - (data.seats / 120) * (2 * Math.PI * 28);
    document.getElementById('seat-ring').style.strokeDasharray = 2 * Math.PI * 28;
    document.getElementById('seat-ring').style.strokeDashoffset = offset;

    const badge = document.getElementById('traffic-badge');
    badge.className = 'badge-glow ' + (data.traffic === 'High' ? 'danger' : data.traffic === 'Medium' ? 'warning' : 'success');
    badge.innerHTML = `<i data-lucide="zap" style="width: 12px; height: 12px;"></i> ${data.traffic} Traffic`;
    lucide.createIcons();

    const trendContainer = document.getElementById('wait-trend-container');
    if (trendContainer && data.trend) {
        let icon = 'minus';
        let text = 'Stable';
        let bg = '#f1f5f9';
        let color = '#64748b';

        if (data.trend === 'up') {
            icon = 'trending-up';
            text = 'Trending Up';
            bg = '#fef2f2'; // Light Red
            color = '#ef4444'; // Red (Bad for wait times)
        } else if (data.trend === 'down') {
            icon = 'trending-down';
            text = 'Trending Down';
            bg = '#ecfdf5'; // Light Green
            color = '#10b981'; // Green (Good for wait times)
        }

        trendContainer.style.background = bg;
        trendContainer.style.color = color;
        trendContainer.innerHTML = `<i data-lucide="${icon}" style="width: 14px; height: 14px;"></i> <span>${text}</span>`;
        lucide.createIcons(); // Re-initialize the newly injected icon
    }
}

async function updateDashboardUI({ shop = currentShop, silent = false } = {}) {
    const requestId = ++dashboardRequestSeq;
    const role = localStorage.getItem('userRole');
    const studentShop = document.getElementById('student-shop-selector')?.value || shop;
    const scopedShop = role === 'staff' ? (localStorage.getItem('staffShop') || 'Meals') : studentShop;

    try {
        const data = await fetchJson(`${BASE_URL}/status?shop=${encodeURIComponent(scopedShop)}`);

        try {
            const settings = await fetchJson(`${BASE_URL}/shop_settings`);
            if (settings && typeof settings === 'object') {
                shopStatuses = { ...shopStatuses, ...settings };
            }
            updateButtonStates();
            syncStaffPauseButton();
        } catch (_settingsErr) {
            // Quietly ignore settings sync errors to avoid noisy UI.
        }

        cacheShopStatus(scopedShop, data);
        statusCache[scopedShop] = data;

        if (role === 'student' && scopedShop === currentShop && requestId === dashboardRequestSeq) {
            renderFromCache(scopedShop);
            fetchMyOrders();
        }

        if (role === 'staff') {
            const avgSpeedSeconds = Number.isFinite(data.avg_speed_seconds) ? Math.max(0, data.avg_speed_seconds) : 0;
            document.getElementById('kds-avg-speed').textContent = formatWaitTime(avgSpeedSeconds);
            syncStaffPauseButton();
        }
    } catch (e) {
        console.error("API Offline", e);
        if (!silent && !statusCache[scopedShop]) {
            showToast("Backend is offline. Start FastAPI server.", "error");
        }
    }
}

function formatServedTime(timestamp) {
    return timestamp || '';
}

function normalizeShopId(shop) {
    return (shop || '').toLowerCase();
}

function updateServedNotices() {
    const now = Date.now();
    orderShops.forEach((shop) => {
        const noticeEl = document.getElementById(`serve-notice-${normalizeShopId(shop)}`);
        if (!noticeEl) {
            return;
        }
        const active = servedNoticeExpiryByShop[shop] > now;
        noticeEl.style.display = active ? 'inline-flex' : 'none';
    });
}

function showOrderSkeletons() {
    orderShops.forEach((shop) => {
        const shopId = normalizeShopId(shop);
        const activeListEl = document.getElementById(`active-orders-list-${shopId}`);
        const completedListEl = document.getElementById(`completed-orders-list-${shopId}`);

        const skeletonHTML = `
            <div class="skeleton skeleton-order-card"></div>
            <div class="skeleton skeleton-order-card"></div>
        `;

        // Only show skeletons if the lists are currently empty (first load)
        if (activeListEl && activeListEl.innerHTML.trim() === '') {
            activeListEl.innerHTML = skeletonHTML;
        }
        if (completedListEl && completedListEl.innerHTML.trim() === '') {
            completedListEl.innerHTML = skeletonHTML;
        }
    });
}

function updateLiveOrderTracker() {
    const tracker = document.getElementById('live-order-tracker');
    const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;

    // Get active orders for this specific shop from our cache
    const shopData = shopDataCache[selectedShop];
    const activeOrders = shopData?.orders?.active || [];

    if (activeOrders.length === 0) {
        tracker.style.display = 'none';
        return;
    }

    // Assume the first active order is the one we are tracking
    const order = activeOrders[0];
    if (!order.time_in_raw || !order.expected_wait_seconds) return;

    const timeIn = new Date(order.time_in_raw);
    const expectedWaitMs = order.expected_wait_seconds * 1000;
    const targetTime = new Date(timeIn.getTime() + expectedWaitMs);
    const now = new Date();

    const remainingMs = targetTime - now;

    document.getElementById('tracker-shop-name').innerText = selectedShop;
    const timeLeftEl = document.getElementById('tracker-time-left');
    const statusTextEl = document.getElementById('tracker-status-text');

    tracker.style.display = 'block';

    if (remainingMs > 60000) {
        // More than 1 minute
        const mins = Math.ceil(remainingMs / 60000);
        timeLeftEl.innerText = `${mins}m`;
        timeLeftEl.style.color = '#15803d'; // Green
        tracker.style.background = '#f0fdf4';
        tracker.style.borderColor = '#bbf7d0';
        statusTextEl.innerText = 'Estimated time remaining';
        statusTextEl.style.color = '#166534';
    } else if (remainingMs > 0 && remainingMs <= 60000) {
        // Less than 1 minute
        timeLeftEl.innerText = '<1m';
        timeLeftEl.style.color = '#15803d';
        tracker.style.background = '#f0fdf4';
        tracker.style.borderColor = '#bbf7d0';
        statusTextEl.innerText = 'Almost ready!';
        statusTextEl.style.color = '#166534';
    } else {
        // Overdue
        const localTargetString = targetTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        timeLeftEl.innerText = 'Delayed';
        timeLeftEl.style.color = '#b91c1c'; // Red
        tracker.style.background = '#fef2f2';
        tracker.style.borderColor = '#fecaca';
        statusTextEl.innerText = `Taking longer than expected. Supposed to be served at ${localTargetString}.`;
        statusTextEl.style.color = '#991b1b';
    }
}

async function fetchMyOrders() {
    const rollNo = localStorage.getItem('userRollNo');
    if (!rollNo) {
        return;
    }

    const hasOrdersUi = orderShops.every((shop) => {
        const id = normalizeShopId(shop);
        return document.getElementById(`active-orders-list-${id}`) && document.getElementById(`completed-orders-list-${id}`);
    });
    if (!hasOrdersUi) {
        return;
    }

    try {
        // Show skeletons if we don't have cached data yet
        if (!completedBootstrapDone) {
            showOrderSkeletons();
        }

        const data = await fetchJson(`${BASE_URL}/my_orders?roll_no=${encodeURIComponent(rollNo)}`);

        const activeItems = Array.isArray(data.active) ? data.active : [];
        let completedItems = Array.isArray(data.completed) ? data.completed : [];
        myActiveShops.clear();

        const activeByShop = { Meals: [], Snacks: [], Beverages: [] };
        const completedByShop = { Meals: [], Snacks: [], Beverages: [] };

        activeItems.forEach((order) => {
            if (activeByShop[order.shop]) {
                activeByShop[order.shop].push(order);
                myActiveShops.add(order.shop);
            }
        });

        completedItems.forEach((order) => {
            if (completedByShop[order.shop]) {
                completedByShop[order.shop].push(order);
            }
        });

        orderShops.forEach((shopName) => {
            const perShopData = {
                active: activeByShop[shopName],
                completed: completedByShop[shopName]
            };
            cacheShopOrders(shopName, perShopData);
        });

        if (!completedBootstrapDone) {
            completedItems.forEach((order) => {
                seenCompletedOrderKeys.add(`${order.shop}|${order.time_served || order.timestamp || ''}`);
            });
            completedBootstrapDone = true;
        } else {
            completedItems.forEach((order) => {
                const key = `${order.shop}|${order.time_served || order.timestamp || ''}`;
                if (!seenCompletedOrderKeys.has(key)) {
                    seenCompletedOrderKeys.add(key);
                    if (servedNoticeExpiryByShop[order.shop] !== undefined) {
                        servedNoticeExpiryByShop[order.shop] = Date.now() + 60_000;
                    }
                }
            });
        }

        orderShops.forEach((shop) => {
            renderOrdersForSingleShop(shop, {
                active: activeByShop[shop],
                completed: completedByShop[shop]
            });
        });

        updateServedNotices();

        const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;
        const notificationBanner = document.getElementById('order-ready-notification');
        const readyShopName = document.getElementById('ready-shop-name');

        // Find the most recently served order for the CURRENTLY selected shop
        const recentShopOrder = completedItems.find(order => order.shop === selectedShop);

        if (notificationBanner && readyShopName && recentShopOrder && recentShopOrder.time_served_raw) {
            const serveTime = new Date(recentShopOrder.time_served_raw);
            const currentTime = new Date();
            const differenceInMs = currentTime - serveTime;

            // 2 minutes = 120,000 milliseconds
            if (differenceInMs <= 120000) {
                readyShopName.innerText = selectedShop;
                notificationBanner.style.display = 'block';
            } else {
                notificationBanner.style.display = 'none';
            }
        } else if (notificationBanner) {
            notificationBanner.style.display = 'none';
        }

        updateButtonStates();
        updateLiveOrderTracker();
    } catch (e) {
        myActiveShops.clear();
        updateButtonStates();
        console.error('My Orders API error:', e);
    }
}

async function prefetchDashboardStatuses() {
    await updateDashboardUI({ shop: currentShop, silent: true });
}

function optimisticIncrementQueue() {
    const queueEl = document.getElementById('student-queue-length') || document.getElementById('queue-val');
    if (!queueEl) {
        return;
    }

    const currentQueue = parseInt(queueEl.innerText, 10);
    if (!Number.isNaN(currentQueue)) {
        queueEl.innerText = String(currentQueue + 1);
    }
}

document.getElementById('join-btn').addEventListener('click', async () => {
    const rollNo = localStorage.getItem('userRollNo')?.trim().toUpperCase();
    const shop = document.getElementById('student-shop-selector')?.value || currentShop;
    if (!rollNo) {
        alert("Error: User session not found. Please log in again.");
        return;
    }

    try {
        optimisticIncrementQueue();

        const res = await fetch(`${BASE_URL}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                roll_no: rollNo,
                shop: shop
            }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.error) {
                alert(data.error);
            }
            console.error("Join Queue Error:", data);
            showToast("Could not join queue. Check backend status.", "error");
            return;
        }

        showToast(`Successfully joined the ${shop} queue!`);
        await updateDashboardUI({ shop: shop });
    } catch (e) {
        console.error("Join Queue Error:", e);
        showToast("Could not join queue. Check backend status.", "error");
        await updateDashboardUI({ shop: shop, silent: true });
    }
});

let qrScanner = null;

function extractRollNoFromScan(decodedText) {
    const raw = (decodedText || '').trim();
    if (!raw) {
        return '';
    }

    // Accept plain roll numbers and payloads like "Roll No: 24B81A67R1".
    const normalized = raw.toUpperCase();
    const likelyRoll = normalized.match(/\b[A-Z0-9]{8,20}\b/g) || [];

    // Prefer tokens that contain both letters and digits.
    const mixedToken = likelyRoll.find((token) => /[A-Z]/.test(token) && /\d/.test(token));
    if (mixedToken) {
        return mixedToken;
    }

    // Fallback to first long alphanumeric token.
    if (likelyRoll.length > 0) {
        return likelyRoll[0];
    }

    return '';
}

document.getElementById('scan-barcode-btn').addEventListener('click', () => {
    const readerEl = document.getElementById('reader');
    readerEl.style.display = 'block';

    if (!window.Html5QrcodeScanner) {
        showToast('Scanner library failed to load.', 'error');
        return;
    }

    if (qrScanner) {
        showToast('Scanner is already running.', 'error');
        return;
    }

    const scannerConfig = {
        fps: 20,
        qrbox: { width: 320, height: 140 }
    };

    if (window.Html5QrcodeSupportedFormats) {
        scannerConfig.formatsToSupport = [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE
        ];
    }

    qrScanner = new Html5QrcodeScanner('reader', scannerConfig, false);

    qrScanner.render(
        async (decodedText) => {
            const rollNo = extractRollNoFromScan(decodedText);
            if (!rollNo) {
                showToast('Could not read roll number from barcode.', 'error');
                return;
            }

            try {
                await qrScanner.clear();
            } catch (e) {
                console.warn('Failed to clear scanner cleanly', e);
            }
            qrScanner = null;
            readerEl.style.display = 'none';

            try {
                optimisticIncrementQueue();

                const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;
                const res = await fetch(`${BASE_URL}/scan_checkin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roll_no: rollNo, shop: selectedShop })
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    console.error("Scan Check-in Error:", data);
                    showToast(data.error || 'Scan check-in failed. Please try again.', 'error');
                    await updateDashboardUI({ shop: selectedShop, silent: true });
                    return;
                }

                showToast(`Scan check-in successful for ${rollNo}`);
                await updateDashboardUI({ shop: selectedShop });
            } catch (e) {
                console.error("Scan Check-in Error:", e);
                showToast('Scan check-in failed. Please try again.', 'error');
                await updateDashboardUI({ shop: (document.getElementById('student-shop-selector')?.value || currentShop), silent: true });
            }
        },
        () => { }
    );
});

// --- FUTURE PLANNER LOGIC & DYNAMIC GRAPH ---
let chartInstance = null;
document.getElementById('predict-btn').addEventListener('click', async () => {
    const btn = document.getElementById('predict-btn');
    const date = document.getElementById('predict-date').value;
    const time = document.getElementById('predict-time').value;
    const shop = document.getElementById('predict-shop').value;

    if (!date || !time) { showToast("Please select a date and time.", "error"); return; }
    if (time < '08:00' || time > '18:00') {
        showToast('Please select a time between 08:00 and 18:00.', 'error');
        return;
    }
    btn.innerHTML = `<i data-lucide="loader"></i> Analyzing...`; lucide.createIcons();

    try {
        const res = await fetch(`${BASE_URL}/predict`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop: shop, date_string: date, time_string: time })
        });
        const data = await res.json();

        const predictedWaitSeconds = Number.isFinite(data.predicted_wait_mins)
            ? Math.max(0, data.predicted_wait_mins * 60)
            : 0;
        const predictedQueue = Number.isFinite(data.predicted_queue) ? Math.max(0, data.predicted_queue) : 0;
        const perOrderSeconds = predictedQueue > 0 ? predictedWaitSeconds / predictedQueue : 0;
        const waitGraphSeconds = Array.isArray(data.hourly_graph)
            ? data.hourly_graph.map((value) => {
                if (!Number.isFinite(value)) return 0;
                return Math.max(0, value) * perOrderSeconds;
            })
            : [];

        document.getElementById('prediction-result').style.display = 'block';
        document.getElementById('pred-wait-val').textContent = formatWaitTime(predictedWaitSeconds);
        document.getElementById('pred-queue-val').textContent = predictedQueue;

        renderChart(waitGraphSeconds, data.graph_labels);
    } catch (e) { showToast("Prediction failed", "error"); }

    btn.innerHTML = `<i data-lucide="search"></i> Predict Wait Time`; lucide.createIcons();
});

// Update renderChart to accept the real ML array
function renderChart(mlDataArray, graphLabels) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const safeMlDataArray = Array.isArray(mlDataArray) ? mlDataArray : [];
    const safeGraphLabels = Array.isArray(graphLabels) && graphLabels.length === safeMlDataArray.length
        ? graphLabels
        : ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];
    const yAxisMax = (safeMlDataArray.length ? Math.max(...safeMlDataArray) : 0) + 10;
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.3)'); gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: safeGraphLabels,
            datasets: [{
                label: 'Predicted Wait Time',
                data: safeMlDataArray,
                borderColor: '#7c3aed', backgroundColor: gradient, borderWidth: 2.5, fill: true, tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${formatWaitTime(context.parsed.y)}`
                    }
                }
            },
            scales: { x: { grid: { display: false } }, y: { display: false, beginAtZero: true, max: yAxisMax } }
        }
    });
}

// --- STAFF KDS LOGIC ---
async function renderOrders() {
    const grid = document.getElementById('kds-grid');
    const staffShop = localStorage.getItem('staffShop');
    if (!staffShop) {
        grid.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; color: var(--sd-text-muted);">No staff shop assigned.</div>`;
        document.getElementById('active-orders-count').textContent = '0';
        return;
    }
    try {
        const orders = await fetchJson(`${BASE_URL}/orders?shop=${encodeURIComponent(staffShop)}`);
        document.getElementById('active-orders-count').textContent = orders.length;

        if (orders.length === 0) {
            grid.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; color: var(--sd-text-muted);">All orders served! 🎉</div>`;
            return;
        }

        grid.innerHTML = orders.map(order => {
            let urgencyClass = '';
            if (order.time_in_raw && order.expected_wait_seconds) {
                const orderTime = new Date(order.time_in_raw);
                const elapsedMs = Date.now() - orderTime;

                const promisedWaitMs = order.expected_wait_seconds * 1000;

                if (elapsedMs >= (promisedWaitMs * 3)) {
                    urgencyClass = 'urgent';
                } else if (elapsedMs >= (promisedWaitMs * 1.5)) {
                    urgencyClass = 'warning';
                }
            }
            return `
            <div class="glass-card order-card fade-in ${urgencyClass}" id="card-${order.id}">
                <div class="order-top"><span class="order-id">ORD-${order.id}</span><span>${order.time_in || '--'}</span></div>
                <div class="order-detail">UID: ${order.uid}</div>
                <div class="order-items">Shop: ${order.shop}</div>
                <button class="btn-outline" onclick="serveOrder(${order.id})" style="width: 100%;"><i data-lucide="check-circle" style="width: 16px;"></i> Mark Served</button>
            </div>`;
        }).join('');
        lucide.createIcons();
    } catch (e) {
        console.error("KDS API Offline", e);
        grid.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; color: var(--sd-text-muted);">Backend offline. Unable to load orders.</div>`;
    }
}

window.serveOrder = async function (orderId) {
    try {
        await fetchJson(`${BASE_URL}/serve/${orderId}`, { method: "POST" });
        renderOrders();
        updateDashboardUI(); // Recalculates metrics for the dashboard
        showToast(`Order ORD-${orderId} marked as served!`);
    } catch (e) {
        showToast("Could not mark order as served.", "error");
    }
};

document.getElementById('staff-pause-btn')?.addEventListener('click', async () => {
    const shop = localStorage.getItem('staffShop');
    if (!shop) {
        return;
    }
    const currentStatus = shopStatuses[shop] !== false;
    const newStatus = !currentStatus;

    try {
        await fetchJson(`${BASE_URL}/toggle_shop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop: shop, is_active: newStatus })
        });

        shopStatuses[shop] = newStatus;
        const btn = document.getElementById('staff-pause-btn');
        if (btn) {
            if (newStatus) {
                btn.style.backgroundColor = '#10b981';
                btn.innerText = 'Accepting Orders';
            } else {
                btn.style.backgroundColor = '#ef4444';
                btn.innerText = 'STATION PAUSED';
            }
        }
        updateButtonStates();
    } catch (e) {
        console.error('Failed to toggle shop state', e);
        showToast('Could not update station status.', 'error');
    }
});

// Keep your original showToast() function here...
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- FUTURE PLANNER CUSTOM PICKERS ---
(function initPlannerPickers() {

    // ── Calendar Picker ──────────────────────────────────────────
    const dateInput = document.getElementById('predict-date');
    const trigger = document.getElementById('date-trigger');
    const popup = document.getElementById('calendar-popup');
    let calCursor = new Date();

    function toLocalStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatDisplay(ds) {
        const [y, m, d] = ds.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function renderCalGrid() {
        const y = calCursor.getFullYear(), mo = calCursor.getMonth();
        document.getElementById('cal-month-display').textContent =
            new Date(y, mo).toLocaleString('default', { month: 'long' });
        document.getElementById('cal-year-display').textContent = y;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayStr = toLocalStr(today);
        const firstDayIndex = new Date(y, mo, 1).getDay();
        const daysInMonth = new Date(y, mo + 1, 0).getDate();
        let html = '';

        // Always render a fixed 6x7 grid (42 cells).
        for (let i = 0; i < 42; i++) {
            // Render blank cells outside current month (no hover/click).
            if (i < firstDayIndex || i > (firstDayIndex + daysInMonth - 1)) {
                html += '<div class="cal-empty" aria-hidden="true"></div>';
                continue;
            }

            const dayNumber = i - firstDayIndex + 1;
            const cellDate = new Date(y, mo, dayNumber);
            cellDate.setHours(0, 0, 0, 0);

            const ds = toLocalStr(cellDate);
            const sel = ds === dateInput.value;
            const tod = ds === todayStr;
            const isPast = cellDate < today;
            const isSunday = cellDate.getDay() === 0;
            const isDisabled = isPast || isSunday;

            html += `<button type="button" class="cal-day${sel ? ' selected' : ''}${tod && !sel ? ' today' : ''}${isDisabled ? ' disabled-date' : ''}" ${isDisabled ? 'disabled' : ''} data-date="${ds}">${dayNumber}</button>`;
        }
        document.getElementById('cal-grid').innerHTML = html;
        document.querySelectorAll('#cal-grid .cal-day').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled-date') || btn.disabled) {
                    return;
                }
                selectDate(btn.dataset.date);
            });
        });
    }

    function selectDate(ds) {
        dateInput.value = ds;
        dateInput.dispatchEvent(new Event('change'));
        if (!dateInput.value) {
            document.getElementById('date-display').textContent = 'Select date';
            syncPills();
            renderCalGrid();
            return;
        }
        document.getElementById('date-display').textContent = formatDisplay(ds);
        popup.classList.remove('open');
        trigger.classList.remove('open');
        syncPills();
        renderCalGrid();
    }

    dateInput.addEventListener('change', function () {
        if (!this.value) return;
        const chosen = new Date(this.value);
        chosen.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (chosen < today) {
            showToast('Past dates are not allowed', 'error');
            this.value = '';
            return;
        }
        if (chosen.getDay() === 0) {
            showToast('Canteen is closed on Sundays', 'error');
            this.value = '';
        }
    });

    function syncPills() {
        document.querySelectorAll('.date-shortcut-btn').forEach(btn => {
            const d = new Date();
            d.setDate(d.getDate() + parseInt(btn.dataset.offset, 10));
            btn.classList.toggle('active', toLocalStr(d) === dateInput.value);
        });
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = popup.classList.toggle('open');
        trigger.classList.toggle('open', open);
        if (open) renderCalGrid();
    });
    document.getElementById('cal-prev').addEventListener('click', (e) => {
        e.stopPropagation(); calCursor.setMonth(calCursor.getMonth() - 1); renderCalGrid();
    });
    document.getElementById('cal-next').addEventListener('click', (e) => {
        e.stopPropagation(); calCursor.setMonth(calCursor.getMonth() + 1); renderCalGrid();
    });
    document.getElementById('cal-prev-yr').addEventListener('click', (e) => {
        e.stopPropagation(); calCursor.setFullYear(calCursor.getFullYear() - 1); renderCalGrid();
    });
    document.getElementById('cal-next-yr').addEventListener('click', (e) => {
        e.stopPropagation(); calCursor.setFullYear(calCursor.getFullYear() + 1); renderCalGrid();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-date-picker')) {
            popup.classList.remove('open');
            trigger.classList.remove('open');
        }
    });
    document.querySelectorAll('.date-shortcut-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = new Date();
            d.setDate(d.getDate() + parseInt(btn.dataset.offset, 10));
            calCursor = new Date(d);
            selectDate(toLocalStr(d));
        });
    });

    selectDate(toLocalStr(new Date())); // default: today
})();

// Initial Calls
renderShopChrome(currentShop);
prefetchDashboardStatuses();
updateDashboardUI({ shop: currentShop, silent: true });
renderOrders();
updateButtonStates();
syncStaffPauseButton();
updateServedNotices();
setInterval(updateServedNotices, 1000);

// Silently fetch new data from the database every 5 seconds!
setInterval(() => {
    const role = localStorage.getItem('userRole');
    if (role === 'student') {
        const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;
        updateDashboardUI({ shop: selectedShop, silent: true });
    }
    if (role === 'staff') {
        const staffShop = localStorage.getItem('staffShop') || 'Meals';
        updateDashboardUI({ shop: staffShop, silent: true });
        if (document.getElementById('kds').style.display !== 'none') {
            renderOrders();
        }
    }
}, 5000);

// ─────────────────────────────────────────────────────────
// MASTER MENU — Staff KDS functions
// ─────────────────────────────────────────────────────────

/**
 * Load and render the menu items table in the KDS Manage Menu section.
 * @param {string} shop - The staff's assigned shop (Meals or Beverages)
 */
async function loadMenuItems(shop) {
    const tbody = document.getElementById('menu-items-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="color: var(--sd-text-muted); text-align:center; padding: 1.5rem;">Loading...</td></tr>`;
    try {
        const items = await fetchJson(`${BASE_URL}/menu?shop=${encodeURIComponent(shop)}`);
        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--sd-text-muted); text-align:center; padding: 1.5rem;">No items yet. Add one above!</td></tr>`;
            return;
        }
        tbody.innerHTML = items.map(item => `
            <tr id="menu-row-${item.id}">
                <td style="font-weight: 600;">${escapeHtml(item.item_name)}</td>
                <td>&#8377;${item.price}</td>
                <td>
                    <label class="toggle-switch" title="${item.is_available ? 'Mark Sold Out' : 'Mark Available'}">
                        <input type="checkbox" ${item.is_available ? 'checked' : ''}
                               onchange="toggleMenuItem(${item.id})">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <button class="menu-delete-btn" onclick="deleteMenuItem(${item.id}, '${escapeHtml(item.item_name)}')" title="Delete item">
                        &#128465;
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="color: var(--sd-danger); text-align:center;">Failed to load menu.</td></tr>`;
        console.error('loadMenuItems error:', e);
    }
}

/**
 * Add a new menu item via the Add Item form in the KDS section.
 */
async function addMenuItem() {
    const nameEl = document.getElementById('menu-item-name');
    const priceEl = document.getElementById('menu-item-price');
    const btn = document.getElementById('menu-add-btn');
    if (!nameEl || !priceEl || !btn) return;

    const name = nameEl.value.trim();
    const price = parseInt(priceEl.value, 10);
    const shop = localStorage.getItem('staffShop');

    if (!name) { showToast('Please enter an item name.', 'error'); return; }
    if (isNaN(price) || price < 0) { showToast('Please enter a valid price.', 'error'); return; }
    if (!shop) { showToast('No shop assigned.', 'error'); return; }

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" style="width:16px;height:16px;"></i> Adding...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        await fetchJson(`${BASE_URL}/admin/menu/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop, item_name: name, price })
        });
        nameEl.value = '';
        priceEl.value = '';
        await loadMenuItems(shop);
        showToast(`"${name}" added to the menu!`);
    } catch (e) {
        showToast('Failed to add item. Try again.', 'error');
        console.error('addMenuItem error:', e);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        lucide.createIcons();
    }
}

/**
 * Toggle the availability of a menu item (called from inline onchange).
 * @param {number} itemId
 */
window.toggleMenuItem = async function (itemId) {
    const shop = localStorage.getItem('staffShop');
    try {
        await fetchJson(`${BASE_URL}/admin/menu/toggle/${itemId}`, { method: 'PATCH' });
        if (shop) await loadMenuItems(shop);
    } catch (e) {
        showToast('Failed to update availability.', 'error');
        if (shop) await loadMenuItems(shop); // reload to restore correct checkbox state
        console.error('toggleMenuItem error:', e);
    }
};

/**
 * Permanently delete a menu item after confirmation.
 * @param {number} itemId
 * @param {string} itemName
 */
window.deleteMenuItem = async function (itemId, itemName) {
    if (!confirm(`Delete "${itemName}" from the menu? This cannot be undone.`)) return;
    const shop = localStorage.getItem('staffShop');
    try {
        await fetchJson(`${BASE_URL}/admin/menu/${itemId}`, { method: 'DELETE' });
        if (shop) await loadMenuItems(shop);
        showToast(`"${itemName}" removed from the menu.`);
    } catch (e) {
        showToast('Failed to delete item.', 'error');
        console.error('deleteMenuItem error:', e);
    }
};

// Wire up the Add Item button
const menuAddBtn = document.getElementById('menu-add-btn');
if (menuAddBtn) {
    menuAddBtn.addEventListener('click', addMenuItem);
}

// Helper: escape HTML to prevent XSS in dynamically built strings
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

// ─────────────────────────────────────────────────────────
// MASTER MENU — Student Dashboard menu display
// ─────────────────────────────────────────────────────────

/**
 * Fetch the menu for `shop` and render it in the student dashboard.
 * Hides the container entirely for Snacks or when no items exist.
 * @param {string} shop
 */
async function fetchStudentMenu(shop) {
    const container = document.getElementById('student-menu-container');
    const grid = document.getElementById('student-menu-grid');
    if (!container || !grid) return;

    // Snacks has no master menu
    if (shop === 'Snacks') {
        container.style.display = 'none';
        return;
    }

    try {
        const items = await fetchJson(`${BASE_URL}/menu?shop=${encodeURIComponent(shop)}`);
        if (!items || items.length === 0) {
            container.style.display = 'none';
            return;
        }
        grid.innerHTML = items.map(item => {
            const badgeClass = item.is_available ? 'badge-available' : 'badge-sold-out';
            const badgeIcon = item.is_available ? '<i data-lucide="check-circle" style="width:14px;height:14px;"></i>' : '<i data-lucide="x-circle" style="width:14px;height:14px;"></i>';
            const badgeText = item.is_available ? 'Available' : 'Sold Out';
            return `
                <div class="menu-item-pill">
                    <span class="item-name">${escapeHtml(item.item_name)}</span>
                    <span class="item-price">₹${item.price}</span>
                    <span class="availability-badge ${badgeClass}">${badgeIcon} ${badgeText}</span>
                </div>
            `;
        }).join('');
        container.style.display = 'block';
        // Render lucide icons for the newly added menu items
        lucide.createIcons();
    } catch (e) {
        container.style.display = 'none';
        console.error('fetchStudentMenu error:', e);
    }
}

// Load the menu on initial page render for the default shop
fetchStudentMenu(currentShop);