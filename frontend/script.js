// Initialize Icons
lucide.createIcons();

// --- STATE MANAGEMENT ---
const state = {
    currentShop: 'Meals',
    metrics: {
        Meals: { queue: 24, wait: 12, seats: 45, totalSeats: 120, traffic: 'Medium' },
        Snacks: { queue: 10, wait: 5, seats: null, totalSeats: null, traffic: 'Low' },
        Beverages: { queue: 45, wait: 20, seats: null, totalSeats: null, traffic: 'High' }
    },
    orders: [
        { id: 'ORD-1024', timeIn: '12:05 PM', uid: 'U-892', items: '2x Meals, 1x Coke' },
        { id: 'ORD-1025', timeIn: '12:08 PM', uid: 'U-411', items: '1x Snacks' },
        { id: 'ORD-1026', timeIn: '12:11 PM', uid: 'U-773', items: '1x Meals' }
    ]
};

// --- ROUTING / NAVIGATION ---
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page-view');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        // Update active class on nav
        navLinks.forEach(n => n.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // Show target page
        const targetId = e.currentTarget.getAttribute('data-target');
        pages.forEach(page => {
            page.style.display = page.id === targetId ? 'block' : 'none';
        });
    });
});

// --- LIVE DASHBOARD LOGIC ---
const shopTabs = document.querySelectorAll('.shop-tab');
shopTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        shopTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        state.currentShop = e.target.getAttribute('data-shop');
        updateDashboardUI();
    });
});

function updateDashboardUI() {
    const data = state.metrics[state.currentShop];
    
    // Update text values
    document.getElementById('queue-val').textContent = data.queue;
    document.getElementById('wait-val').textContent = data.wait;
    
    // Handle Seats (Only for Meals)
    const seatsCard = document.getElementById('seats-card');
    if (data.seats !== null) {
        seatsCard.style.display = 'block';
        document.getElementById('seats-val').textContent = data.seats;
        document.getElementById('seat-text').textContent = data.seats;
        
        // Calculate Progress Ring (Circumference = 2 * PI * r) -> r=28
        const circumference = 2 * Math.PI * 28;
        const offset = circumference - (data.seats / data.totalSeats) * circumference;
        const ring = document.getElementById('seat-ring');
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = offset;
    } else {
        seatsCard.style.display = 'none';
    }

    // Update Traffic Badge
    const badge = document.getElementById('traffic-badge');
    badge.className = 'badge-glow ' + (data.traffic === 'High' ? 'danger' : data.traffic === 'Medium' ? 'warning' : 'success');
    badge.innerHTML = `<i data-lucide="zap" style="width: 12px; height: 12px;"></i> ${data.traffic} Traffic`;
    lucide.createIcons(); // re-init new icon
}

document.getElementById('join-queue-btn').addEventListener('click', () => {
    showToast(`Successfully joined the ${state.currentShop} queue!`);
});


// --- FUTURE PLANNER LOGIC ---
let chartInstance = null;
document.getElementById('predict-btn').addEventListener('click', () => {
    const btn = document.getElementById('predict-btn');
    const date = document.getElementById('predict-date').value;
    const time = document.getElementById('predict-time').value;

    if (!date || !time) {
        showToast("Please select a date and time.", "error");
        return;
    }

    btn.innerHTML = `<i data-lucide="loader"></i> Analyzing...`;
    lucide.createIcons();
    
    // Mock API Delay
    setTimeout(() => {
        document.getElementById('prediction-result').style.display = 'block';
        document.getElementById('pred-wait-val').textContent = Math.floor(Math.random() * 20) + 5;
        document.getElementById('pred-queue-val').textContent = Math.floor(Math.random() * 40) + 10;
        
        renderChart();
        
        btn.innerHTML = `<i data-lucide="search"></i> Predict Wait Time`;
        lucide.createIcons();
    }, 800);
});

function renderChart() {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.3)');
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM'],
            datasets: [{
                label: 'Predicted Traffic',
                data: [12, 25, 85, 60, 30, 15],
                borderColor: '#7c3aed',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { display: false, min: 0 }
            }
        }
    });
}


// --- STAFF KDS LOGIC ---
function renderOrders() {
    const grid = document.getElementById('kds-grid');
    document.getElementById('active-orders-count').textContent = state.orders.length;
    
    if (state.orders.length === 0) {
        grid.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; color: var(--sd-text-muted);">All orders served! 🎉</div>`;
        return;
    }

    grid.innerHTML = state.orders.map(order => `
        <div class="glass-card order-card fade-in" id="card-${order.id}">
            <div class="order-top">
                <span class="order-id">${order.id}</span>
                <span>${order.timeIn}</span>
            </div>
            <div class="order-detail">UID: ${order.uid}</div>
            <div class="order-items">${order.items}</div>
            <button class="btn-outline" onclick="serveOrder('${order.id}')" style="width: 100%;">
                <i data-lucide="check-circle" style="width: 16px;"></i> Mark Served
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

// Attach globally so inline onclick works
window.serveOrder = function(orderId) {
    state.orders = state.orders.filter(o => o.id !== orderId);
    renderOrders();
    showToast(`Order ${orderId} marked as served!`);
};


// --- TOAST UTILITY ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initial Calls
updateDashboardUI();
renderOrders();