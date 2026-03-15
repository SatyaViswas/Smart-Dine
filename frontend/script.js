// Initialize Icons
lucide.createIcons();

// --- STATE MANAGEMENT ---
const API_HOST = window.location.hostname || '127.0.0.1';
const BASE_URL = `http://${API_HOST}:8000/api`;

// --- AUTHENTICATION LOGIC (LOGIN & SIGNUP) ---
const authScreen = document.getElementById('auth-screen');
const appContent = document.getElementById('app-content');
const navBar = document.querySelector('.nav-floating');

let isLoginMode = true; // Tracks whether we are logging in or signing up

// Check if user is already logged in
const savedRollNo = localStorage.getItem('userRollNo');
const savedName = localStorage.getItem('userName');

if (savedRollNo && savedName) {
    completeLogin(savedName, savedRollNo);
} else {
    appContent.style.display = 'none';
    navBar.style.display = 'none';
}

// Handle switching between Login and Sign Up
document.getElementById('auth-switch-btn').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-error').style.display = 'none'; // Clear errors
    
    if (isLoginMode) {
        document.getElementById('auth-title').textContent = "Smart-Dine Login";
        document.getElementById('auth-subtitle').textContent = "Enter your College Roll Number";
        document.getElementById('auth-name').style.display = 'none';
        document.getElementById('auth-btn-text').textContent = "Access Dashboard";
        document.getElementById('auth-switch-text').textContent = "Don't have an account?";
        document.getElementById('auth-switch-btn').textContent = "Sign Up";
    } else {
        document.getElementById('auth-title').textContent = "Create Account";
        document.getElementById('auth-subtitle').textContent = "Register for Smart-Dine Campus";
        document.getElementById('auth-name').style.display = 'block';
        document.getElementById('auth-btn-text').textContent = "Create Account";
        document.getElementById('auth-switch-text').textContent = "Already have an account?";
        document.getElementById('auth-switch-btn').textContent = "Log In";
    }
});

// Handle the Form Submission
document.getElementById('auth-btn').addEventListener('click', async () => {
    const rollNoInput = document.getElementById('auth-roll-no').value.trim();
    const nameInput = document.getElementById('auth-name').value.trim();
    const btnText = document.getElementById('auth-btn-text');
    const errorMsg = document.getElementById('auth-error');
    
    if (!rollNoInput) {
        showAuthError("Roll Number is required.");
        return;
    }
    if (!isLoginMode && !nameInput) {
        showAuthError("Full Name is required for Sign Up.");
        return;
    }
    
    // UI Loading State
    const originalText = btnText.textContent;
    btnText.innerHTML = "Processing...";
    
    try {
        const endpoint = isLoginMode ? "/login" : "/signup";
        const payload = isLoginMode ? { roll_no: rollNoInput } : { roll_no: rollNoInput, name: nameInput };
        
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (res.ok) {
            // Save to browser memory
            localStorage.setItem('userRollNo', data.roll_no);
            localStorage.setItem('userName', data.name);
            completeLogin(data.name, data.roll_no);
        } else {
            // FIX: If FastAPI sends an array of validation errors, map them to readable text
            if (Array.isArray(data.detail)) {
                const errorMessages = data.detail.map(err => `${err.loc[1]}: ${err.msg}`).join(', ');
                showAuthError("Server Error - " + errorMessages);
            } else {
                showAuthError(data.detail || "Authentication failed.");
            }
        }
    } catch (e) {
        showAuthError("Server offline. Please check your connection.");
    } finally {
        if(authScreen.style.display !== 'none') {
            btnText.textContent = originalText;
        }
    }
});

function showAuthError(message) {
    const errorMsg = document.getElementById('auth-error');
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

function completeLogin(name, rollNo) {
    authScreen.style.display = 'none';
    appContent.style.display = 'block';
    navBar.style.display = 'flex';
    
    document.querySelector('.dashboard-header h1').textContent = `Welcome, ${name}`;
    document.querySelector('.dashboard-header p').textContent = `Smart-Dine Campus Canteen | ${rollNo}`;
    
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.querySelector('.avatar').textContent = initials;
}

document.querySelector('.avatar').addEventListener('click', () => {
    if(confirm("Do you want to logout?")) {
        localStorage.clear();
        location.reload();
    }
});
let currentShop = 'Meals';

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
        updateDashboardUI();
    });
});

async function updateDashboardUI() {
    try {
        const data = await fetchJson(`${BASE_URL}/status?shop=${currentShop}`);
        const avgSpeedSeconds = Number.isFinite(data.avg_speed_seconds) ? Math.max(0, data.avg_speed_seconds) : 0;
        const avgMinutes = Math.floor(avgSpeedSeconds / 60);
        const avgSeconds = avgSpeedSeconds % 60;
        const formattedAvgSpeed = `${avgMinutes}m ${avgSeconds}s`;
        
        document.getElementById('queue-val').textContent = data.queue;
        document.getElementById('wait-val').textContent = data.wait;
        document.getElementById('kds-avg-speed').textContent = formattedAvgSpeed;
        
        const seatsCard = document.getElementById('seats-card');
        if (currentShop === 'Meals') {
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
    } catch (e) {
        console.error("API Offline", e);
        showToast("Backend is offline. Start FastAPI server.", "error");
    }
}

document.getElementById('join-queue-btn').addEventListener('click', async () => {
    const uid = localStorage.getItem('userRollNo'); 
    try {
        await fetchJson(`${BASE_URL}/join`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: uid, shop: currentShop }),
        });
        showToast(`Successfully joined the ${currentShop} queue!`);
        updateDashboardUI();
    } catch (e) {
        showToast("Could not join queue. Check backend status.", "error");
    }
});

// --- FUTURE PLANNER LOGIC & DYNAMIC GRAPH ---
let chartInstance = null;
document.getElementById('predict-btn').addEventListener('click', async () => {
    const btn = document.getElementById('predict-btn');
    const date = document.getElementById('predict-date').value;
    const time = document.getElementById('predict-time').value;
    const shop = document.getElementById('predict-shop').value;

    if (!date || !time) { showToast("Please select a date and time.", "error"); return; }
    btn.innerHTML = `<i data-lucide="loader"></i> Analyzing...`; lucide.createIcons();
    
    try {
        const res = await fetch(`${BASE_URL}/predict`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop: shop, date_string: date, time_string: time })
        });
        const data = await res.json();
        
        document.getElementById('prediction-result').style.display = 'block';
        document.getElementById('pred-wait-val').textContent = data.predicted_wait_mins;
        document.getElementById('pred-queue-val').textContent = data.predicted_queue;
        
        // Pass the real ML array to the chart!
        renderChart(data.hourly_graph); 
    } catch (e) { showToast("Prediction failed", "error"); }
    
    btn.innerHTML = `<i data-lucide="search"></i> Predict Wait Time`; lucide.createIcons();
});

// Update renderChart to accept the real ML array
function renderChart(mlDataArray) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const safeMlDataArray = Array.isArray(mlDataArray) ? mlDataArray : [];
    const yAxisMax = (safeMlDataArray.length ? Math.max(...safeMlDataArray) : 0) + 10;
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.3)'); gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'], 
            datasets: [{ 
                label: 'Predicted Queue Length', 
                data: safeMlDataArray,
                borderColor: '#7c3aed', backgroundColor: gradient, borderWidth: 2.5, fill: true, tension: 0.4 
            }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false, beginAtZero: true, max: yAxisMax } } }
    });
}

// --- STAFF KDS LOGIC ---
async function renderOrders() {
    const grid = document.getElementById('kds-grid');
    try {
        const orders = await fetchJson(`${BASE_URL}/orders`);
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

// Initial Calls
updateDashboardUI();
renderOrders();

// Silently fetch new data from the database every 5 seconds!
setInterval(() => {
    // Only update the dashboard if the user is currently looking at it
    if (document.getElementById('dashboard').style.display !== 'none') {
        updateDashboardUI();
    }
    // Only update the kitchen screen if the staff is looking at it
    if (document.getElementById('kds').style.display !== 'none') {
        renderOrders();
    }
}, 5000);