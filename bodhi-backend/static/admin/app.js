const BASE_URL = window.location.origin;

// State management
let state = {
    token: null
};

// DOM Elements
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const viewTitle = document.getElementById('view-title');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem('bodhi_admin_token');
    if (savedToken) {
        state.token = savedToken;
        showDashboard();
    }
});

// --- Auth logic ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    loginError.textContent = '';

    try {
        const formData = new URLSearchParams();
        formData.append('username', email); // FastAPI OAuth2 standard
        formData.append('password', password);

        const response = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        state.token = data.access_token;
        localStorage.setItem('bodhi_admin_token', state.token);

        showDashboard();

    } catch (err) {
        loginError.textContent = err.message;
    }
});

// --- Dashboard Functions ---
function showDashboard() {
    loginContainer.style.display = 'none';
    dashboardContainer.style.display = 'flex';

    // Decode JWT to show Admin info
    if (state.token) {
        try {
            const payload = JSON.parse(atob(state.token.split('.')[1]));
            document.getElementById('admin-name').textContent = payload.sub || "Administrator";
        } catch (e) { }
    }

    loadOverview();
}

const handleLogout = () => {
    localStorage.removeItem('bodhi_admin_token');
    window.location.reload();
};

logoutBtn.addEventListener('click', handleLogout);

const headerLogoutBtn = document.getElementById('logout-btn-header');
if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener('click', handleLogout);
}

async function apiFetch(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${state.token}`
        }
    };

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options);
        if (response.status === 401 || response.status === 403) {
            handleLogout(); // Auto-logout if token expires/invalid
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

// --- Navigation ---
navItems.forEach(item => {
    if (item.id === 'logout-btn' || item.id === 'logout-btn-header') return; // handled separately

    item.addEventListener('click', () => {
        // Update active states
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Update View Title
        viewTitle.textContent = item.querySelector('span').textContent;

        // Switch Views
        const targetView = item.dataset.view;
        switchView(targetView);
    });
});

async function switchView(targetView) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

    // Show target view
    document.getElementById(`view-${targetView}`).style.display = 'block';

    // Load data
    if (targetView === 'overview') await loadOverview();
    if (targetView === 'users') await loadUsers();
    if (targetView === 'transactions') await loadTransactions();
    if (targetView === 'notifications') await loadNotifications();
}

// --- Data Loading ---
async function loadOverview() {
    const stats = await apiFetch('/admin/dashboard');
    if (!stats) return;

    document.getElementById('stat-total-users').textContent = stats.total_users;
    document.getElementById('stat-total-balance').textContent = `₹${parseFloat(stats.total_balance_pool).toLocaleString('en-IN')}`;
    document.getElementById('stat-total-txns').textContent = stats.total_transactions;

    // Load some recent user logs
    const users = await apiFetch('/admin/users?limit=5');
    const tbody = document.querySelector('#recent-logs tbody');
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>New User (${u.role})</td>
            <td>${u.email}</td>
            <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Banned'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

async function loadUsers() {
    const users = await apiFetch('/admin/users');
    const tbody = document.querySelector('#users-table tbody');

    tbody.innerHTML = users.map(u => {
        const promoteBtn = u.role === 'admin'
            ? `<button class="action-btn" style="background:var(--error); color:white;" onclick="demoteAdmin('${u.id}')">Remove Admin</button>`
            : `<button class="action-btn" onclick="makeAdmin('${u.id}')">Promote to Admin</button>`;

        return `
        <tr>
            <td>${u.id.substring(0, 8)}</td>
            <td>${u.email}</td>
            <td><span class="status-badge active" style="background: ${u.role === 'admin' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.1)'}">${u.role.toUpperCase()}</span></td>
            <td style="display: flex; gap: 8px;">
                ${promoteBtn}
                <button class="action-btn" style="background: var(--error); color: white;" onclick="deleteUser('${u.id}')">Delete</button>
            </td>
        </tr>
    `}).join('');
}

// Global Actions for Users
window.makeAdmin = async (userId) => {
    if (confirm("Promote this user to root Administrator?")) {
        await apiFetch(`/admin/make-admin/${userId}`, 'PUT');
        loadUsers();
    }
};

window.demoteAdmin = async (userId) => {
    if (confirm("Demote this administrator back to a standard user?")) {
        await apiFetch(`/admin/remove-admin/${userId}`, 'PUT');
        loadUsers();
    }
};

window.deleteUser = async (userId) => {
    if (confirm("WARNING: Are you absolutely sure you want to permanently delete this user?")) {
        await apiFetch(`/admin/user/${userId}`, 'DELETE');
        loadUsers();
        loadOverview(); // Refresh counts
    }
};

async function loadTransactions() {
    const txs = await apiFetch('/admin/transactions');
    const tbody = document.querySelector('#tx-table tbody');
    tbody.innerHTML = txs.map(t => `
        <tr>
            <td>${t.id.slice(0, 8)}...</td>
            <td>${t.user_id.slice(0, 8)}...</td>
            <td style="color: ${t.entry_type === 'DEBIT' ? '#ff3b30' : '#34c759'}">
                ${t.entry_type === 'DEBIT' ? '-' : '+'}₹${t.amount.toLocaleString('en-IN')}
            </td>
            <td>${t.entry_type}</td>
            <td><span class="status-badge active">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// --- Notifications Logic ---
async function loadNotifications() {
    const users = await apiFetch('/admin/users?limit=1000');
    const container = document.getElementById('notif-users-list');

    if (!users || users.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">No users found.</p>';
        return;
    }

    container.innerHTML = users.map(u => `
        <label style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: 0.2s;">
            <input type="checkbox" name="user-check" value="${u.id}" class="user-checkbox" style="width: 16px; height: 16px; accent-color: var(--accent-purple);">
            <div>
                <div style="font-size: 14px; font-weight: 600; color: white;">${u.full_name}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">${u.email}</div>
            </div>
        </label>
    `).join('');

    // Bind "Select All" functionality
    const selectAllBtn = document.getElementById('notif-select-all');
    const checkboxes = document.querySelectorAll('.user-checkbox');

    selectAllBtn.addEventListener('change', (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
}

// Notification Submit Handler
const notifForm = document.getElementById('notification-form');
if (notifForm) {
    notifForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('notif-title').value;
        const message = document.getElementById('notif-message').value;
        const type = document.getElementById('notif-type').value;
        const sendToAll = document.getElementById('notif-select-all').checked;

        const checkboxes = document.querySelectorAll('.user-checkbox:checked');
        const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);

        if (!sendToAll && selectedUserIds.length === 0) {
            alert('Please select at least one user or choose Select All.');
            return;
        }

        const submitBtn = document.getElementById('notif-submit-btn');
        const statusSpan = document.getElementById('notif-status');

        submitBtn.disabled = true;
        statusSpan.textContent = "Broadcasting...";
        statusSpan.style.color = "var(--text-secondary)";

        const res = await apiFetch('/admin/notifications/send', 'POST', {
            user_ids: selectedUserIds,
            send_to_all: sendToAll,
            title: title,
            message: message,
            type: type
        });

        submitBtn.disabled = false;

        if (res) {
            statusSpan.textContent = "✅ Broadcast Successful!";
            statusSpan.style.color = "var(--success)";
            notifForm.reset();
            document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
            setTimeout(() => { statusSpan.textContent = ''; }, 3000);
        } else {
            statusSpan.textContent = "❌ Broadcast Failed";
            statusSpan.style.color = "var(--error)";
        }
    });
}

// Team invite replaced with direct Native Creation as per single-table specs
const inviteForm = document.getElementById('invite-form');
if (inviteForm) {
    inviteForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('invite-name').value;
        const email = document.getElementById('invite-email').value;

        const submitBtn = document.getElementById('invite-submit-btn');
        const statusSpan = document.getElementById('invite-status');

        submitBtn.disabled = true;
        statusSpan.textContent = "Creating Root Admin...";
        statusSpan.style.color = "var(--text-secondary)";

        try {
            // Note: Generating default password for new root admin
            // Normally handled via email setup logic but using specs
            const res = await apiFetch('/admin/create-admin', 'POST', {
                full_name: fullName,
                email: email,
                password: "DefaultAdminPassword123!"
            });

            if (res) {
                statusSpan.textContent = "✅ Administrator natively minted!";
                statusSpan.style.color = "var(--success)";
                inviteForm.reset();
            }
        } catch (err) {
            statusSpan.textContent = "❌ Failed to create";
            statusSpan.style.color = "var(--error)";
        } finally {
            submitBtn.disabled = false;
        }
    });
}
