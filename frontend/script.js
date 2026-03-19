// Initialize Icons
lucide.createIcons();

// --- STATE MANAGEMENT ---
const API_HOST = window.location.hostname || '127.0.0.1';
const BASE_URL = `https://automotive-tue-diamonds-throw.trycloudflare.com/api`;

// --- AUTHENTICATION LOGIC (LOGIN & SIGNUP) ---
const authScreen = document.getElementById('auth-screen');
const appContent = document.getElementById('app-content');
const navBar = document.querySelector('.nav-floating');

let isLoginMode = true; // Tracks whether we are logging in or signing up
let isStaffMode = false; // Tracks whether the active role is Staff or Student

// Check if user is already logged in
const savedRole   = localStorage.getItem('userRole');
const savedRollNo = localStorage.getItem('userRollNo');
const savedEmail  = localStorage.getItem('userEmail');
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

    document.getElementById('auth-roll-no').style.display          = isStaff ? 'none'  : 'block';
    document.getElementById('auth-email').style.display            = isStaff ? 'block' : 'none';
    document.getElementById('auth-password').style.display         = isStaff ? 'block' : 'none';
    document.getElementById('auth-staff-shop').style.display       = (isStaff && !isLogin) ? 'block' : 'none';
    document.getElementById('auth-confirm-password').style.display = (isStaff && !isLogin) ? 'block' : 'none';

    document.getElementById('auth-btn-text').textContent    = isLogin ? 'Access Dashboard' : 'Create Account';
    document.getElementById('auth-switch-text').textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
    document.getElementById('auth-switch-btn').textContent  = isLogin ? 'Sign Up' : 'Log In';
}

// Handle the Form Submission
document.getElementById('auth-btn').addEventListener('click', async () => {
    const btnText = document.getElementById('auth-btn-text');
    const originalText = btnText.textContent;
    document.getElementById('auth-error').style.display = 'none';

    if (isStaffMode) {
        // --- STAFF AUTH FLOW ---
        const email    = document.getElementById('auth-email').value.trim();
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
        document.getElementById('planner').style.display   = 'none';
        document.getElementById('kds').style.display       = 'block';
        const assignedShop = localStorage.getItem('staffShop') || 'Meals';
        document.getElementById('kds-shop-title').innerText = `${assignedShop} KDS`;
    } else {
        navBar.style.display = 'flex';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('planner').style.display   = 'none';
        document.getElementById('kds').style.display       = 'none';
        document.querySelector('.dashboard-header h1').textContent = 'Welcome, Student';
        document.querySelector('.dashboard-header p').textContent  = `Smart-Dine Campus Canteen | ${identifier}`;
        document.querySelector('.avatar').textContent = 'ST';
    }
}

document.querySelector('.avatar').addEventListener('click', () => {
    if(confirm("Do you want to logout?")) {
        localStorage.clear();
        location.reload();
    }
});

document.getElementById('staff-logout-btn').addEventListener('click', () => {
    if(confirm("Do you want to logout?")) {
        localStorage.clear();
        location.reload();
    }
});
let currentShop = 'Meals';
const statusCache = {};
let dashboardRequestSeq = 0;

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
        if (targetId === 'kds') renderOrders();
    });
});

// --- LIVE DASHBOARD LOGIC ---
const shopTabs = document.querySelectorAll('.shop-tab');
shopTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        shopTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentShop = e.target.getAttribute('data-shop');
        const selector = document.getElementById('student-shop-selector');
        if (selector) {
            selector.value = currentShop;
        }
        renderShopChrome(currentShop);
        if (statusCache[currentShop]) {
            renderDashboardData(currentShop, statusCache[currentShop]);
        }
        updateDashboardUI({ shop: currentShop, silent: true });
    });
});

const studentShopSelector = document.getElementById('student-shop-selector');
if (studentShopSelector) {
    studentShopSelector.value = currentShop;
    studentShopSelector.addEventListener('change', (e) => {
        currentShop = e.target.value;
        shopTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.getAttribute('data-shop') === currentShop);
        });
        renderShopChrome(currentShop);
        updateDashboardUI({ shop: currentShop, silent: true });
    });
}

function renderShopChrome(shop) {
    document.getElementById('seats-card').style.display = shop === 'Meals' ? 'block' : 'none';
}

function renderDashboardData(shop, data) {
    const avgSpeedSeconds = Number.isFinite(data.avg_speed_seconds) ? Math.max(0, data.avg_speed_seconds) : 0;
    const formattedAvgSpeed = formatWaitTime(avgSpeedSeconds);
    const rawWaitSeconds = Number.isFinite(data.queue) ? Math.max(0, data.queue) * avgSpeedSeconds : 0;

    document.getElementById('queue-val').textContent = data.queue;
    const waitValueEl = document.getElementById('wait-val');
    waitValueEl.textContent = formatWaitTime(rawWaitSeconds);
    if (waitValueEl.nextElementSibling) {
        waitValueEl.nextElementSibling.textContent = '';
    }
    document.getElementById('kds-avg-speed').textContent = formattedAvgSpeed;

    const seatsCard = document.getElementById('seats-card');
    if (shop === 'Meals') {
        seatsCard.style.display = 'block';
        document.getElementById('seats-val').textContent = data.seats;
        document.getElementById('seat-text').textContent = data.seats;
        const offset = (2 * Math.PI * 28) - (data.seats / 120) * (2 * Math.PI * 28);
        document.getElementById('seat-ring').style.strokeDasharray = 2 * Math.PI * 28;
        document.getElementById('seat-ring').style.strokeDashoffset = offset;
    } else {
        seatsCard.style.display = 'none';
    }

    const badge = document.getElementById('traffic-badge');
    badge.className = 'badge-glow ' + (data.traffic === 'High' ? 'danger' : data.traffic === 'Medium' ? 'warning' : 'success');
    badge.innerHTML = `<i data-lucide="zap" style="width: 12px; height: 12px;"></i> ${data.traffic} Traffic`;
    lucide.createIcons();
}

async function updateDashboardUI({ shop = currentShop, silent = false } = {}) {
    const requestId = ++dashboardRequestSeq;
    const role = localStorage.getItem('userRole');
    const studentShop = document.getElementById('student-shop-selector')?.value || shop;
    const scopedShop = role === 'staff' ? (localStorage.getItem('staffShop') || 'Meals') : studentShop;

    try {
        const data = await fetchJson(`${BASE_URL}/status?shop=${encodeURIComponent(scopedShop)}`);
        statusCache[scopedShop] = data;

        if (role === 'student' && scopedShop === currentShop && requestId === dashboardRequestSeq) {
            renderDashboardData(scopedShop, data);
        }

        if (role === 'staff') {
            const avgSpeedSeconds = Number.isFinite(data.avg_speed_seconds) ? Math.max(0, data.avg_speed_seconds) : 0;
            document.getElementById('kds-avg-speed').textContent = formatWaitTime(avgSpeedSeconds);
        }
    } catch (e) {
        console.error("API Offline", e);
        if (!silent && !statusCache[scopedShop]) {
            showToast("Backend is offline. Start FastAPI server.", "error");
        }
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

document.getElementById('join-queue-btn').addEventListener('click', async () => {
    const rollNo = localStorage.getItem('userRollNo');
    const selectedShop = document.getElementById('student-shop-selector')?.value || currentShop;
    if (!rollNo) {
        showToast("Missing roll number. Please log in again.", "error");
        return;
    }

    try {
        optimisticIncrementQueue();

        const res = await fetch(`${BASE_URL}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roll_no: rollNo, shop: selectedShop }),
        });

        if (!res.ok) {
            console.error("Join Queue Error:", await res.text());
            showToast("Could not join queue. Check backend status.", "error");
            return;
        }

        showToast(`Successfully joined the ${selectedShop} queue!`);
        await updateDashboardUI({ shop: selectedShop });
    } catch (e) {
        console.error("Join Queue Error:", e);
        showToast("Could not join queue. Check backend status.", "error");
        await updateDashboardUI({ shop: selectedShop, silent: true });
    }
});

let qrScanner = null;
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

    qrScanner = new Html5QrcodeScanner(
        'reader',
        {
            fps: 30,
            qrbox: { width: 300, height: 100 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        },
        false
    );

    qrScanner.render(
        async (decodedText) => {
            const rollNo = (decodedText || '').trim();
            if (!rollNo) {
                showToast('Scanned code is empty.', 'error');
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
                    console.error("Scan Check-in Error:", await res.text());
                    showToast('Scan check-in failed. Please try again.', 'error');
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
        () => {}
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
            const timeObj = new Date(order.time_in * 1000);
            const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
            <div class="glass-card order-card fade-in" id="card-${order.id}">
                <div class="order-top"><span class="order-id">ORD-${order.id}</span><span>${timeStr}</span></div>
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

window.serveOrder = async function(orderId) {
    try {
        await fetchJson(`${BASE_URL}/serve/${orderId}`, { method: "POST" });
        renderOrders();
        updateDashboardUI(); // Recalculates metrics for the dashboard
        showToast(`Order ORD-${orderId} marked as served!`);
    } catch (e) {
        showToast("Could not mark order as served.", "error");
    }
};

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
    const trigger   = document.getElementById('date-trigger');
    const popup     = document.getElementById('calendar-popup');
    let calCursor   = new Date();

    function toLocalStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

        const todayStr  = toLocalStr(new Date());
        const firstDay  = new Date(y, mo, 1).getDay();
        const totalDays = new Date(y, mo + 1, 0).getDate();
        let html = '<span></span>'.repeat(firstDay);

        for (let d = 1; d <= totalDays; d++) {
            const ds   = `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const past = ds < todayStr;
            const sel  = ds === dateInput.value;
            const tod  = ds === todayStr;
            html += `<button type="button" class="cal-day${sel?' selected':''}${tod&&!sel?' today':''}${past?' past':''}" ${past?'disabled':''} data-date="${ds}">${d}</button>`;
        }
        document.getElementById('cal-grid').innerHTML = html;
        document.querySelectorAll('#cal-grid .cal-day:not([disabled])').forEach(btn =>
            btn.addEventListener('click', () => selectDate(btn.dataset.date))
        );
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
        if (new Date(this.value).getDay() === 0) {
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