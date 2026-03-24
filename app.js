// ═══════════════════════════════════════════════════════
// ALVINT — Performance Management
// ═══════════════════════════════════════════════════════

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NOW        = new Date();
const CUR_MONTH  = NOW.getMonth() + 1;
const CUR_YEAR   = NOW.getFullYear();



// ── Default permissions (stored in Firestore, editable by Developer) ──
const DEFAULT_PERMISSIONS = {
  developer: {
    canManagePeople:    true,
    canManageDepts:     true,
    canManageTargets:   true,
    canManageUsers:     true,
    canEditPermissions: true,
    canViewAllDashboard:true,
    canViewOwnDashboard:true,
    canEnterActuals:    true,
    canEnterForecast:   true,
    canInviteDeveloper: true,
    canInviteSuperuser: true,
    canInviteUser:      true,
  },
  superuser: {
    canManagePeople:    false,
    canManageDepts:     true,
    canManageTargets:   true,
    canManageUsers:     true,
    canEditPermissions: false,
    canViewAllDashboard:true,
    canViewOwnDashboard:true,
    canEnterActuals:    true,
    canEnterForecast:   true,
    canInviteDeveloper: false,
    canInviteSuperuser: false,
    canInviteUser:      true,
  },
  user: {
    canManagePeople:    false,
    canManageDepts:     false,
    canManageTargets:   false,
    canManageUsers:     false,
    canEditPermissions: false,
    canViewAllDashboard:false,
    canViewOwnDashboard:true,
    canEnterActuals:    true,
    canEnterForecast:   true,
    canInviteDeveloper: false,
    canInviteSuperuser: false,
    canInviteUser:      false,
  },
};

const PERM_LABELS = {
  canManagePeople:     'Add / edit / delete employees',
  canManageDepts:      'Add / edit departments',
  canManageTargets:    'Set up targets & plans',
  canManageUsers:      'Manage user accounts',
  canEditPermissions:  'Edit permission matrix',
  canViewAllDashboard: 'View full team dashboard',
  canViewOwnDashboard: 'View own dashboard',
  canEnterActuals:     'Enter monthly actuals',
  canEnterForecast:    'Enter FY forecast',
  canInviteDeveloper:  'Invite Developers',
  canInviteSuperuser:  'Invite Superusers',
  canInviteUser:       'Invite Users',
};

// ── State ──
let _currentUser   = null;   // Firebase Auth user
let _currentProfile= null;   // Firestore userProfile doc
let _permissions   = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
let _employees     = [];
let _departments   = [];
let _dashData      = [];
let _targets       = [];
let _tempKpis      = [];
let _editingKpiTargetId = null;
let _trackActuals  = {};
let _trackPlans    = {};
let _trackForecasts= {};
let _trackTargets  = [];

// ═══════════════════════════════════════════════════════
// INVITE LINK HANDLER (runs before auth check)
// ═══════════════════════════════════════════════════════
(function checkInviteLink() {
  var token = null;
  try {
    var params = new URLSearchParams(window.location.search);
    token = params.get('invite');
    if (!token && window.location.hash) {
      var h = window.location.hash.replace(/^#\/?/, '');
      var hp = new URLSearchParams(h.includes('?') ? h.split('?')[1] : h);
      token = hp.get('invite');
    }
  } catch(e) { return; }
  if (!token) return;

  document.getElementById('invite-screen').classList.add('open');
  document.getElementById('login-screen').classList.add('hidden');

  db.collection('invites').doc(token).get().then(function(snap) {
    if (!snap.exists) {
      showInviteError('Invite link invalid or expired. (token: ' + token + ')');
      return;
    }
    var inv = snap.data();
    if (inv.used) { showInviteError('This invite link has already been used.'); return; }
    if (inv.expiresAt && inv.expiresAt.toDate() < new Date()) { showInviteError('This invite link has expired.'); return; }
    document.getElementById('invite-email').value = inv.email;
    document.getElementById('invite-title').textContent = 'Welcome to ALVINT!';
    document.getElementById('invite-subtitle').textContent = 'Set a password for ' + inv.email + ' to activate your ' + inv.role + ' account.';
    window._inviteToken = token;
    window._inviteData  = inv;
  }).catch(function(err) {
    showInviteError('Could not load invite. ' + (err.message || err.code || 'Check Firestore rules.') + ' (token: ' + token + ')');
  });
})();

function showInviteError(msg) {
  document.getElementById('invite-error').style.display = 'flex';
  document.getElementById('invite-error').textContent = msg;
  document.getElementById('invite-form').style.display = 'none';
}

async function completeInvite() {
  const pw  = document.getElementById('invite-password').value;
  const pw2 = document.getElementById('invite-password2').value;
  const btn = document.getElementById('invite-btn');
  const err = document.getElementById('invite-error');
  err.style.display = 'none';

  if (pw.length < 6)    { err.textContent='Password must be at least 6 characters.'; err.style.display='flex'; return; }
  if (pw !== pw2)        { err.textContent='Passwords do not match.'; err.style.display='flex'; return; }

  btn.textContent = 'Activating…'; btn.disabled = true;

  const inv = window._inviteData;
  try {
    // Create Firebase Auth account
    const cred = await auth.createUserWithEmailAndPassword(inv.email, pw);
    const uid  = cred.user.uid;

    // Create user profile in Firestore
    await db.collection('userProfiles').doc(uid).set({
      email:      inv.email,
      role:       inv.role,
      employeeId: inv.employeeId || null,
      firstName:  inv.firstName  || '',
      lastName:   inv.lastName   || '',
      createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
      invitedBy:  inv.invitedBy  || '',
    });

    // Mark invite as used
    await db.collection('invites').doc(window._inviteToken).update({ used: true, usedAt: firebase.firestore.FieldValue.serverTimestamp(), uid });

    document.getElementById('invite-success').style.display = 'flex';
    document.getElementById('invite-success').textContent = '✓ Account activated! Redirecting…';
    document.getElementById('invite-form').style.display = 'none';

    // Clean URL and let auth state handle the rest
    setTimeout(() => { window.location.href = window.location.pathname; }, 1500);
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'flex';
    btn.textContent = 'Activate Account →';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  if (window._inviteToken) return; // handled by invite flow

  if (user) {
    _currentUser = user;
    await loadUserProfile(user.uid);
    await loadPermissions();
    await loadBaseData();
    initApp();
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').style.display = 'flex';
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
  }
});

async function loadUserProfile(uid) {
  const snap = await db.collection('userProfiles').doc(uid).get();
  if (snap.exists) {
    _currentProfile = { id: snap.id, ...snap.data() };
  } else {
    // Legacy: create a developer profile if none exists (first ever user)
    _currentProfile = { id: uid, email: _currentUser.email, role: 'developer', employeeId: null, firstName: '', lastName: '' };
    await db.collection('userProfiles').doc(uid).set({ ..._currentProfile, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  updateSidebarUser();
}

async function loadPermissions() {
  const snap = await db.collection('system').doc('permissions').get();
  if (snap.exists) {
    _permissions = snap.data();
  } else {
    // First time: seed defaults
    await db.collection('system').doc('permissions').set(DEFAULT_PERMISSIONS);
    _permissions = DEFAULT_PERMISSIONS;
  }
}

function can(perm) {
  const role = _currentProfile?.role || 'user';
  return !!_permissions[role]?.[perm];
}

function updateSidebarUser() {
  const p = _currentProfile;
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'User';
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-avatar').textContent = name[0].toUpperCase();
  document.getElementById('sidebar-avatar').style.background = roleColor(p.role);

  const rb = document.getElementById('sidebar-role-badge');
  rb.textContent = p.role;
  rb.className = `user-role-badge badge badge-${p.role}`;
}

function roleColor(role) {
  return role === 'developer' ? 'var(--orange)' : role === 'superuser' ? 'var(--purple)' : 'var(--accent)';
}

function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-password').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.style.display = 'none';
  btn.textContent = 'Signing in…'; btn.disabled = true;
  auth.signInWithEmailAndPassword(email, pass)
    .catch(() => {
      err.style.display = 'flex';
      btn.textContent = 'Sign In →'; btn.disabled = false;
    });
}

function doLogout() { auth.signOut(); }

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function initApp() {
  populateYearSelects();
  populateMonthSelect();
  applyPermissionsToNav();

  // Determine landing page
  if (can('canViewAllDashboard')) {
    showPage('dashboard');
  } else {
    showPage('my-dashboard');
  }

  // If user role, restrict tracking to own profile
  if (!can('canManageTargets')) {
    lockTrackingToSelf();
  }
}

function populateYearSelects() {
  const years = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];
  ['dash-year','target-year','track-year','my-dash-year'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = years.map(y => `<option value="${y}" ${y===CUR_YEAR?'selected':''}>${y}</option>`).join('');
  });
}

function populateMonthSelect() {
  const el = document.getElementById('track-month');
  el.innerHTML = MONTHS.map((m,i) => `<option value="${i+1}" ${i+1===CUR_MONTH?'selected':''}>${m}</option>`).join('');
}

function applyPermissionsToNav() {
  // Hide nav items user doesn't have access to
  document.querySelectorAll('.perm-nav').forEach(el => {
    const perm = el.dataset.perm;
    el.classList.toggle('hidden', !can(perm));
  });
  document.querySelectorAll('.perm-nav-section').forEach(el => {
    const perm = el.dataset.perm;
    el.classList.toggle('hidden', !can(perm));
  });
  // Hide full dashboard nav if no permission
  document.getElementById('nav-dashboard').classList.toggle('hidden', !can('canViewAllDashboard'));
  // Always show my-dashboard
  document.getElementById('nav-my-dashboard').classList.remove('hidden');
}

// Lock tracking page to current user's employee profile
function lockTrackingToSelf() {
  const empId = _currentProfile?.employeeId;
  const sel   = document.getElementById('track-emp');
  const wrap  = document.getElementById('tracking-selectors');
  if (empId) {
    // hide selector, auto-load
    wrap.style.display = 'none';
    sel.value = empId;
  }
}

// ═══════════════════════════════════════════════════════
// BASE DATA
// ═══════════════════════════════════════════════════════
async function loadBaseData() {
  const [empSnap, deptSnap] = await Promise.all([
    db.collection('employees').get(),
    db.collection('departments').get()
  ]);
  _employees   = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  _departments = deptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  populateEmpSelects();
  populateDeptSelects();
}

function populateEmpSelects() {
  const sorted = [..._employees].sort((a,b) => (a.firstName||a.name||'').localeCompare(b.firstName||b.name||''));
  const opts = `<option value="">Choose a person…</option>` +
    sorted.map(e => `<option value="${e.id}">${fullName(e)} — ${e.role||''}</option>`).join('');
  ['target-emp','track-emp'].forEach(id => { document.getElementById(id).innerHTML = opts; });

  // Invite modal emp list
  const invOpts = `<option value="">None (standalone account)</option>` +
    sorted.map(e => `<option value="${e.id}">${fullName(e)}</option>`).join('');
  document.getElementById('invite-modal-emp').innerHTML = invOpts;

  // Edit user modal
  const editOpts = `<option value="">None</option>` +
    sorted.map(e => `<option value="${e.id}">${fullName(e)}</option>`).join('');
  document.getElementById('edit-user-emp').innerHTML = editOpts;
}

function populateDeptSelects() {
  const opts = `<option value="">Select…</option>` + _departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  document.getElementById('emp-dept').innerHTML = opts;

  const dd = document.getElementById('dash-dept');
  const prev = dd.value;
  dd.innerHTML = `<option value="all">All Departments</option>` + _departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  dd.value = prev || 'all';
}

function fullName(e) {
  if (e.firstName || e.lastName) return [e.firstName, e.lastName].filter(Boolean).join(' ');
  return e.name || '';
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  const nav  = document.getElementById('nav-' + name);
  if (page) page.classList.add('active');
  if (nav)  nav.classList.add('active');

  if (name === 'people')      renderPeople();
  if (name === 'departments') loadDepartmentsPage();
  if (name === 'targets')     { /* selector-driven */ }
  if (name === 'tracking')    { if (!can('canManageTargets') && _currentProfile?.employeeId) loadTracking(); }
  if (name === 'dashboard')   loadDashboard();
  if (name === 'my-dashboard') loadMyDashboard();
  if (name === 'users')       loadUsers();
  if (name === 'permissions') loadPermissionsPage();
}

// ═══════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});


// ═══════════════════════════════════════════════════════
// DEPARTMENTS PAGE (developer only)
// ═══════════════════════════════════════════════════════
async function loadDepartmentsPage() {
  const content = document.getElementById('dept-content');
  if (!content) return;
  content.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';
  await loadBaseData();
  let html = `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="font-family:var(--font-h);font-weight:700">Departments (${_departments.length})</h3>
      <button class="btn btn-primary btn-sm" onclick="openDeptModal()">+ Add Department</button>
    </div>
    <table class="table">
      <thead><tr><th>Name</th><th>Employees</th><th></th></tr></thead>
      <tbody>
        ${_departments.map(d => {
          const count = _employees.filter(e=>e.department===d.name).length;
          const dName = esc(d.name).replace(/'/g,"\\'");
          return `<tr><td style="font-weight:500">${esc(d.name)}</td><td style="color:var(--muted)">${count} member${count!==1?'s':''}</td><td><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-xs" onclick="openDeptEditModal('${dName}')">Edit</button><button class="btn btn-danger btn-xs" onclick="deleteDept('${d.id}','${dName}')">Delete</button></div></td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
  content.innerHTML = html;
}

async function deleteDept(id, name) {
  const count = _employees.filter(e=>e.department===name).length;
  if (count > 0) return alert('Cannot delete "'+name+'" — it has '+count+' employee'+(count!==1?'s':'')+'. Reassign them first.');
  if (!confirm('Delete department "'+name+'"?')) return;
  await db.collection('departments').doc(id).delete();
  await loadBaseData();
  loadDepartmentsPage();
}

// ═══════════════════════════════════════════════════════
// PEOPLE PAGE
// ═══════════════════════════════════════════════════════
function renderPeople() {
  const content = document.getElementById('people-content');
  document.getElementById('people-subtitle').textContent =
    `${_employees.length} member${_employees.length!==1?'s':''} across ${_departments.length} department${_departments.length!==1?'s':''}`;

  if (_employees.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">👤</div><h3>No people yet</h3><p>Add team members to start tracking</p></div>`;
    return;
  }

  const byDept = {};
  _employees.forEach(e => {
    const d = e.department || 'Unassigned';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(e);
  });

  const canEdit = can('canManagePeople');

  content.innerHTML = Object.entries(byDept).map(([dept, emps]) => `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">
        🏢 ${esc(dept)}
        ${can('canManageDepts') ? `<button class="btn btn-ghost btn-xs" onclick="openDeptEditModal('${dept}')">Edit</button>` : ''}
        <span style="color:var(--dim);font-weight:400">— ${emps.length} member${emps.length!==1?'s':''}</span>
      </div>
      <div class="emp-grid">
        ${emps.map(emp => `
          <div class="emp-card">
            <div class="emp-avatar" style="background:hsl(${fullName(emp).charCodeAt(0)*13%360},55%,35%)">${(fullName(emp)[0]||'?').toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px">${esc(fullName(emp))}</div>
              <div style="color:var(--muted);font-size:12px">${esc(emp.role||'')}</div>
              ${emp.email?`<div style="color:var(--dim);font-size:11px;margin-top:1px">${esc(emp.email)}</div>`:''}
            </div>
            ${canEdit ? `<div style="display:flex;gap:3px">
              <button class="icon-btn" onclick="openEmpModal('${emp.id}')" style="color:var(--muted)">✏️</button>
              <button class="icon-btn" onclick="deleteEmployee('${emp.id}','${esc(fullName(emp))}')">🗑️</button>
            </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function openEmpModal(id) {
  document.getElementById('emp-id').value = id || '';
  if (id) {
    const e = _employees.find(x => x.id === id);
    document.getElementById('modal-emp-title').textContent = 'Edit Person';
    document.getElementById('emp-fname').value = e.firstName || e.name || '';
    document.getElementById('emp-lname').value = e.lastName  || '';
    document.getElementById('emp-role').value  = e.role      || '';
    document.getElementById('emp-dept').value  = e.department|| '';
    document.getElementById('emp-email').value = e.email     || '';
  } else {
    document.getElementById('modal-emp-title').textContent = 'Add Person';
    ['emp-fname','emp-lname','emp-role','emp-email'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('emp-dept').value = '';
  }
  openModal('modal-emp');
}

async function saveEmployee() {
  const id    = document.getElementById('emp-id').value;
  const fname = document.getElementById('emp-fname').value.trim();
  const lname = document.getElementById('emp-lname').value.trim();
  const role  = document.getElementById('emp-role').value.trim();
  const dept  = document.getElementById('emp-dept').value;
  const email = document.getElementById('emp-email').value.trim();
  if (!fname || !role || !dept) return alert('First name, role and department are required.');

  const data = { firstName: fname, lastName: lname, name: `${fname} ${lname}`.trim(), role, department: dept, email };
  if (id) { await db.collection('employees').doc(id).update(data); }
  else    { await db.collection('employees').add(data); }
  closeModal('modal-emp');
  await loadBaseData();
  renderPeople();
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  await db.collection('employees').doc(id).delete();
  await loadBaseData();
  renderPeople();
}

function openDeptModal() {
  document.getElementById('dept-id').value = '';
  document.getElementById('dept-name').value = '';
  document.getElementById('modal-dept-title').textContent = 'Add Department';
  openModal('modal-dept');
}

function openDeptEditModal(name) {
  const dept = _departments.find(d => d.name === name);
  document.getElementById('dept-id').value   = dept?.id || '';
  document.getElementById('dept-name').value = name;
  document.getElementById('modal-dept-title').textContent = 'Edit Department';
  openModal('modal-dept');
}

async function saveDept() {
  const id   = document.getElementById('dept-id').value;
  const name = document.getElementById('dept-name').value.trim();
  if (!name) return;
  if (id) { await db.collection('departments').doc(id).update({ name }); }
  else    { await db.collection('departments').add({ name }); }
  closeModal('modal-dept');
  await loadBaseData();
  renderPeople();
}

// ═══════════════════════════════════════════════════════
// USER MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════
async function loadUsers() {
  const content = document.getElementById('users-content');
  content.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  // Show/hide developer invite option based on role
  const devOpt = document.getElementById('invite-dev-option');
  if (devOpt) devOpt.style.display = can('canInviteDeveloper') ? '' : 'none';

  const [profilesSnap, invitesSnap] = await Promise.all([
    db.collection('userProfiles').get(),
    db.collection('invites').where('used','==',false).get()
  ]);

  const profiles = profilesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const invites  = invitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let html = `
    <div class="card" style="margin-bottom:20px">
      <h3 style="font-family:var(--font-h);font-weight:700;margin-bottom:16px">Active Users (${profiles.length})</h3>
      <table class="table">
        <thead><tr>
          <th>Name / Email</th><th>Role</th><th>Linked Employee</th><th>Joined</th><th></th>
        </tr></thead>
        <tbody>
          ${profiles.map(p => {
            const emp = _employees.find(e => e.id === p.employeeId);
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:9px">
                  <div style="width:30px;height:30px;border-radius:50%;background:${roleColor(p.role)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0a0c10;flex-shrink:0">${name[0]?.toUpperCase()}</div>
                  <div>
                    <div style="font-weight:500">${esc(name)}</div>
                    <div style="color:var(--muted);font-size:11px">${esc(p.email||'')}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge badge-${p.role}">${p.role}</span></td>
              <td style="color:var(--muted);font-size:12px">${emp ? esc(fullName(emp)) : '<span style="color:var(--dim)">None</span>'}</td>
              <td style="color:var(--muted);font-size:12px">${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : '—'}</td>
              <td>
                ${p.id !== _currentUser.uid ? `
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" onclick="openEditUserModal('${p.id}','${p.role}','${p.employeeId||''}')">Edit</button>
                    <button class="btn btn-danger btn-xs" onclick="deleteUserProfile('${p.id}','${esc(name)}')">Remove</button>
                  </div>` : `<span style="color:var(--dim);font-size:11px">You</span>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (invites.length > 0) {
    html += `
      <div class="card">
        <h3 style="font-family:var(--font-h);font-weight:700;margin-bottom:16px">Pending Invites (${invites.length})</h3>
        <table class="table">
          <thead><tr><th>Email</th><th>Role</th><th>Invite Link</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            ${invites.map(inv => `<tr>
              <td>${esc(inv.email)}</td>
              <td><span class="badge badge-${inv.role}">${inv.role}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <input value="${window.location.origin}${window.location.pathname}?invite=${inv.id}" readonly style="font-size:11px;padding:4px 8px;width:260px;color:var(--muted)">
                  <button class="btn btn-ghost btn-xs" onclick="copyInviteLink('${inv.id}')">Copy</button>
                </div>
              </td>
              <td style="color:var(--muted);font-size:12px">${inv.expiresAt?.toDate ? inv.expiresAt.toDate().toLocaleDateString() : '—'}</td>
              <td><button class="btn btn-danger btn-xs" onclick="revokeInvite('${inv.id}')">Revoke</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  content.innerHTML = html;
}

function openInviteModal() {
  document.getElementById('invite-modal-email').value = '';
  document.getElementById('invite-modal-role').value  = '';
  document.getElementById('invite-modal-emp').value   = '';
  document.getElementById('invite-modal-result').style.display = 'none';
  document.getElementById('invite-modal-form').style.display   = '';
  document.getElementById('invite-modal-footer').style.display = '';

  // Restrict role options based on current user's permissions
  const roleEl = document.getElementById('invite-modal-role');
  roleEl.innerHTML = '<option value="">Select role…</option>';
  if (can('canInviteUser'))       roleEl.innerHTML += '<option value="user">User</option>';
  if (can('canInviteSuperuser'))  roleEl.innerHTML += '<option value="superuser">Superuser</option>';
  if (can('canInviteDeveloper'))  roleEl.innerHTML += '<option value="developer">Developer</option>';

  openModal('modal-invite');
}

async function createInvite() {
  const email = document.getElementById('invite-modal-email').value.trim();
  const role  = document.getElementById('invite-modal-role').value;
  const empId = document.getElementById('invite-modal-emp').value;
  if (!email || !role) return alert('Email and role are required.');

  const token   = uid();
  const expires = new Date(); expires.setDate(expires.getDate() + 7);

  await db.collection('invites').doc(token).set({
    email, role,
    employeeId: empId || null,
    invitedBy:  _currentUser.uid,
    used:       false,
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    expiresAt:  firebase.firestore.Timestamp.fromDate(expires),
  });

  const link = `${window.location.origin}${window.location.pathname}?invite=${token}`;

  document.getElementById('invite-modal-form').style.display   = 'none';
  document.getElementById('invite-modal-footer').style.display = 'none';
  document.getElementById('invite-modal-result').style.display = '';
  const mailSubject = encodeURIComponent("You've been invited to ALVINT");
  const mailBody = encodeURIComponent("Hi,\n\nYou've been invited to join ALVINT Performance Management as a "+role+".\n\nClick this link to set your password and activate your account:\n\n"+link+"\n\nThis link expires in 7 days.\n\nWelcome aboard!");
  const mailtoHref = "mailto:"+email+"?subject="+mailSubject+"&body="+mailBody;
  document.getElementById('invite-modal-result').innerHTML = `
    <div class="alert alert-success">✓ Invite created for ${esc(email)}!</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;margin-bottom:10px">
      <input value="${esc(link)}" readonly style="font-size:12px;padding:8px 10px">
      <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${link}').then(()=>this.textContent='✓ Copied!')">Copy Link</button>
    </div>
    <a href="${mailtoHref}" class="btn btn-success btn-sm" style="display:inline-flex;text-decoration:none;margin-bottom:8px">✉️ Open Email Draft</a>
    <p style="color:var(--muted);font-size:11px;margin-top:4px">Clicking above opens your email app with the invite pre-written. Link expires in 7 days.</p>
    <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="closeModal('modal-invite');loadUsers()">Done</button>
  `;
}

function copyInviteLink(token) {
  const link = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  navigator.clipboard.writeText(link).then(() => alert('Link copied to clipboard!'));
}

async function revokeInvite(id) {
  if (!confirm('Revoke this invite?')) return;
  await db.collection('invites').doc(id).delete();
  loadUsers();
}

function openEditUserModal(id, role, empId) {
  document.getElementById('edit-user-id').value   = id;
  document.getElementById('edit-user-role').value = role;
  document.getElementById('edit-user-emp').value  = empId || '';
  openModal('modal-edit-user');
}

async function saveUserEdit() {
  const id    = document.getElementById('edit-user-id').value;
  const role  = document.getElementById('edit-user-role').value;
  const empId = document.getElementById('edit-user-emp').value;
  await db.collection('userProfiles').doc(id).update({ role, employeeId: empId || null });
  closeModal('modal-edit-user');
  loadUsers();
}

async function deleteUserProfile(id, name) {
  if (!confirm(`Remove ${name} from the system? This only removes their profile, not their Firebase Auth account.`)) return;
  await db.collection('userProfiles').doc(id).delete();
  loadUsers();
}

// ═══════════════════════════════════════════════════════
// PERMISSIONS PAGE
// ═══════════════════════════════════════════════════════
function loadPermissionsPage() {
  const roles = ['developer','superuser','user'];
  const perms = Object.keys(PERM_LABELS);

  let html = `
    <div class="card">
      <p style="color:var(--muted);font-size:13px;margin-bottom:18px">Control what each role can access. Changes take effect on next login.</p>
      <div style="overflow-x:auto">
        <table class="perm-table">
          <thead>
            <tr>
              <th style="width:260px">Permission</th>
              ${roles.map(r => `<th><span class="badge badge-${r}">${r}</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${perms.map(perm => `
              <tr>
                <td>${PERM_LABELS[perm]}</td>
                ${roles.map(r => `
                  <td>
                    <input type="checkbox" class="perm-check" data-role="${r}" data-perm="${perm}"
                      ${_permissions[r]?.[perm] ? 'checked' : ''}
                      ${r === 'developer' && (perm === 'canEditPermissions' || perm === 'canViewOwnDashboard') ? 'disabled' : ''}
                      onchange="updatePermMatrix(this)">
                  </td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('permissions-content').innerHTML = html;
}

function updatePermMatrix(el) {
  const role = el.dataset.role;
  const perm = el.dataset.perm;
  if (!_permissions[role]) _permissions[role] = {};
  _permissions[role][perm] = el.checked;
}

async function savePermissions() {
  const btn = document.getElementById('btn-save-perms');
  btn.textContent = 'Saving…'; btn.disabled = true;
  await db.collection('system').doc('permissions').set(_permissions);
  btn.textContent = '✓ Saved!'; btn.style.background = 'var(--green)'; btn.style.color = '#0a0c10';
  setTimeout(() => { btn.textContent = 'Save Changes'; btn.style.background=''; btn.style.color=''; btn.disabled=false; }, 2500);
}

// ═══════════════════════════════════════════════════════
// TARGETS PAGE
// ═══════════════════════════════════════════════════════
async function loadTargets() {
  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);
  const content = document.getElementById('targets-content');
  if (!empId) { content.innerHTML = `<div class="empty"><div class="empty-icon">🎯</div><h3>Select a person above</h3></div>`; return; }
  content.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
  const snap = await db.collection('targetPlans').doc(`${empId}_${year}`).get();
  _targets = snap.exists ? (snap.data().targets || []) : [];
  if (_targets.length === 0) _targets = [blankTarget()];
  renderTargetsList();
}

function blankTarget() { return { id: uid(), name:'', type:'kpi', weight:0, fyGoal:'', description:'', kpis:[], direction:'gte' }; }
function uid() { return Math.random().toString(36).slice(2,10); }

function renderTargetsList() {
  const content = document.getElementById('targets-content');
  const total   = _targets.reduce((s,t) => s+(parseFloat(t.weight)||0), 0);
  const ok      = Math.abs(total-100) < 0.01;
  const empId   = document.getElementById('target-emp').value;
  const emp     = _employees.find(e => e.id === empId);

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:hsl(${fullName(emp||{}).charCodeAt(0)*13%360},55%,35%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff">${(fullName(emp||{})[0]||'?').toUpperCase()}</div>
        <div><div style="font-weight:600">${esc(fullName(emp||{}))}</div><div style="font-size:12px;color:var(--muted)">${esc(emp?.role||'')} · ${esc(emp?.department||'')}</div></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="distributeTargetWeights()">Auto-distribute</button>
        ${_targets.length<5?`<button class="btn btn-secondary btn-sm" onclick="addTarget()">+ Add Target</button>`:''}
      </div>
    </div>
    <div class="${ok?'weight-status weight-ok':'weight-status weight-bad'}" style="margin-bottom:14px">
      ${ok?'✓':'⚠'} Total weight: <strong>${total}%</strong>${!ok?' — must equal 100%':''}
    </div>
    <div style="display:grid;grid-template-columns:20px 20px 1fr 140px 100px 120px 90px 70px auto;gap:7px;padding:4px 14px;font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
      <span></span><span></span><span>Target Name</span><span>Description</span><span>Type</span><span>FY Goal</span><span>Achievement</span><span>Weight%</span><span></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${_targets.map((t,i) => renderTargetRow(t,i)).join('')}
    </div>
    <div style="margin-top:20px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveTargets()" id="btn-save-targets">Save Targets</button>
    </div>`;
}

function renderTargetRow(t,i) {
  const kpisBadge = t.kpis&&t.kpis.length>0?'<span style="color:var(--green);font-size:11px"> '+t.kpis.length+'</span>':'';
  const isFirst = i===0;
  const isLast  = i===_targets.length-1;
  return `
    <div class="card-sm" id="trow-${t.id}">
      <div style="display:grid;grid-template-columns:20px 20px 1fr 140px 100px 120px 90px 70px auto;gap:7px;align-items:center">
        <!-- Up/Down arrows -->
        <button class="icon-btn" onclick="moveTarget('${t.id}',-1)" style="font-size:14px;opacity:${isFirst?'0.2':'0.7'};padding:2px" ${isFirst?'disabled':''} title="Move up">↑</button>
        <button class="icon-btn" onclick="moveTarget('${t.id}',1)"  style="font-size:14px;opacity:${isLast?'0.2':'0.7'};padding:2px" ${isLast?'disabled':''}  title="Move down">↓</button>
        <input id="tn-${t.id}" value="${esc(t.name)}" placeholder="e.g. Revenue Growth" oninput="updateTarget('${t.id}','name',this.value)">
        <input id="td-${t.id}" value="${esc(t.description||'')}" placeholder="Optional" oninput="updateTarget('${t.id}','description',this.value)">
        <select onchange="updateTarget('${t.id}','type',this.value)">
          <option value="kpi"     ${t.type==='kpi'?'selected':''}>Single KPI</option>
          <option value="project" ${t.type==='project'?'selected':''}>Project</option>
        </select>
        <input id="tg-${t.id}" value="${esc(t.fyGoal||t.unit||'')}" placeholder="e.g. $5M, 95%" oninput="updateTarget('${t.id}','fyGoal',this.value)">
        <select onchange="updateTarget('${t.id}','direction',this.value)" style="font-size:12px">
          <option value="gte" ${(t.direction||'gte')==='gte'?'selected':''}>≥ Equal or greater</option>
          <option value="lte" ${t.direction==='lte'?'selected':''}>≤ Equal or lower</option>
          <option value="yesno" ${t.direction==='yesno'?'selected':''}>✓ Yes / No</option>
        </select>
        <input id="tw-${t.id}" type="number" min="0" max="100" value="${t.weight}" oninput="updateTarget('${t.id}','weight',this.value)">
        <div style="display:flex;gap:3px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="openMonthlyModal('${t.id}')" style="padding:4px 7px;font-size:12px" title="Monthly Goals">📅</button>
          ${t.type==='project'?`<button class="btn btn-ghost btn-sm" onclick="openKpiModal('${t.id}')" style="padding:4px 7px;font-size:12px" title="Configure KPIs">⚙️${kpisBadge}</button>`:''}
          ${_targets.length>1?`<button class="icon-btn" onclick="removeTarget('${t.id}')" style="color:var(--dim)" title="Delete">🗑️</button>`:''}
        </div>
      </div>
      ${t.type==='project'&&t.kpis&&t.kpis.length>0?`
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          ${t.kpis.map(k=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <span style="color:var(--dim);font-size:11px">›</span>
            <span style="font-size:12px;flex:1;color:var(--muted)">${esc(k.name)}</span>
            <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent)">${k.weight}%</span>
          </div>`).join('')}
        </div>`:''}
    </div>`;
}

function syncTargetsFromDOM() {
  // Preserve any typed-but-not-saved text values before re-rendering
  _targets = _targets.map(t => {
    const nameEl  = document.getElementById('tn-'+t.id);
    const descEl  = document.getElementById('td-'+t.id);
    const goalEl  = document.getElementById('tg-'+t.id);
    const wEl     = document.getElementById('tw-'+t.id);
    return {
      ...t,
      name:        nameEl ? nameEl.value        : t.name,
      description: descEl ? descEl.value        : t.description,
      fyGoal:      goalEl ? goalEl.value        : t.fyGoal,
      weight:      wEl    ? (parseFloat(wEl.value)||0) : t.weight,
    };
  });
}

function updateTarget(id, field, value) {
  syncTargetsFromDOM();
  _targets = _targets.map(t => t.id===id
    ? {...t, [field]: field==='weight' ? (parseFloat(value)||0) : value}
    : t
  );
  // Re-render just weight bar for most fields, full list for type change (shows/hides gear icon)
  if (field === 'type') {
    renderTargetsList();
    return;
  }
  const total = _targets.reduce((s,t)=>s+(parseFloat(t.weight)||0),0);
  const ok = Math.abs(total-100)<0.01;
  const ws = document.querySelector('.weight-status');
  if (ws) { ws.className=`weight-status ${ok?'weight-ok':'weight-bad'}`; ws.innerHTML=`${ok?'✓':'⚠'} Total weight: <strong>${total}%</strong>${!ok?' — must equal 100%':''}`; }
}

function addTarget() {
  syncTargetsFromDOM();
  if(_targets.length>=5) return;
  _targets.push(blankTarget());
  renderTargetsList();
}
function removeTarget(id) {
  syncTargetsFromDOM();
  _targets=_targets.filter(t=>t.id!==id);
  renderTargetsList();
}
function moveTarget(id, dir) {
  syncTargetsFromDOM();
  const idx = _targets.findIndex(t => t.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _targets.length) return;
  const arr = [..._targets];
  const tmp = arr[idx];
  arr[idx] = arr[newIdx];
  arr[newIdx] = tmp;
  _targets = arr;
  renderTargetsList();
}
function distributeTargetWeights() {
  syncTargetsFromDOM();
  const w=Math.floor(100/_targets.length), rem=100-w*_targets.length;
  _targets=_targets.map((t,i)=>({...t,weight:i===0?w+rem:w}));
  renderTargetsList();
}

async function saveTargets() {
  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);
  const total = _targets.reduce((s,t)=>s+(parseFloat(t.weight)||0),0);
  if (Math.abs(total-100)>0.01) return alert('Weights must total 100%');
  if (_targets.some(t=>!t.name.trim())) return alert('All targets need a name');
  const btn=document.getElementById('btn-save-targets');
  btn.textContent='Saving…'; btn.disabled=true;
  await db.collection('targetPlans').doc(`${empId}_${year}`).set({empId,year,targets:_targets});
  btn.textContent='✓ Saved!'; btn.style.background='var(--green)'; btn.style.color='#0a0c10';
  setTimeout(()=>{btn.textContent='Save Targets';btn.style.background='';btn.style.color='';btn.disabled=false;},2500);
}


// ═══════════════════════════════════════════════════════
// TRAFFIC LIGHT + MONTHLY GOALS MODAL
// ═══════════════════════════════════════════════════════
let _monthlyTargetId = null;
let _monthlyData     = {};  // { month: { goal, actual, fyForecast, tl } }

function trafficLight(actual, goal, direction) {
  if (goal === '' || goal === null || goal === undefined) return '';
  const g = parseFloat(goal);
  if (isNaN(g) || g === 0) return '';
  let pct;
  if (direction === 'yesno') {
    pct = (actual >= 1) ? 100 : 0;
  } else if (direction === 'lte') {
    if (parseFloat(actual) === 0) return '🟢';
    pct = (g / parseFloat(actual)) * 100;
  } else {
    pct = (parseFloat(actual) / g) * 100;
  }
  if (isNaN(pct)) return '';
  if (pct >= 100) return '🟢';
  if (pct >= 80)  return '🟡';
  return '🔴';
}

function tlOverride(m, auto) {
  return _monthlyData[m] && _monthlyData[m].tl ? _monthlyData[m].tl : auto;
}

async function openMonthlyModal(targetId) {
  _monthlyTargetId = targetId;
  const target = _targets.find(t => t.id === targetId);
  if (!target) return;

  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);

  // Load all monthly actuals
  const snaps = await Promise.all(
    Array.from({length:12}, (_, i) =>
      db.collection('actuals').doc(`${empId}_${year}_${i+1}`).get()
    )
  );

  _monthlyData = {};
  snaps.forEach((snap, i) => {
    const m = i + 1;
    const d = snap.exists ? snap.data() : {};
    const actual = d.actuals && d.actuals[targetId] ? d.actuals[targetId].value : '';
    const goal   = d.plans   && d.plans[targetId]   ? d.plans[targetId].value   : '';
    const fyF    = d.forecasts && d.forecasts[targetId] ? d.forecasts[targetId].fyForecast : '';
    const tl     = d.trafficOverride && d.trafficOverride[targetId] ? d.trafficOverride[targetId] : '';
    _monthlyData[m] = { goal, actual, fyForecast: fyF, tl };
  });

  renderMonthlyModal(target, empId, year);
  document.getElementById('modal-monthly').classList.add('open');
}

function tlDropdown(curAutoTL, overrideTL, onchangeCall) {
  // Shows ONE traffic light: the override if set, else auto. No duplication.
  const displayed = overrideTL || curAutoTL || '';
  return '<div style="display:flex;align-items:center;gap:6px;justify-content:center">'
    + '<span style="font-size:20px;min-width:24px;text-align:center">' + (displayed || '—') + '</span>'
    + '<select style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:11px;padding:3px 6px;color:var(--muted);cursor:pointer" onchange="' + onchangeCall + '">'
    + '<option value="" ' + (!overrideTL?'selected':'') + '>auto</option>'
    + '<option value="🟢" ' + (overrideTL==='🟢'?'selected':'') + '>🟢 Override</option>'
    + '<option value="🟡" ' + (overrideTL==='🟡'?'selected':'') + '>🟡 Override</option>'
    + '<option value="🔴" ' + (overrideTL==='🔴'?'selected':'') + '>🔴 Override</option>'
    + '</select>'
    + '</div>';
}

function renderMonthlyModal(target, empId, year) {
  document.getElementById('modal-monthly-title').textContent = '📅 Monthly Goals: ' + (target.name || 'Target');
  const dir  = target.direction || 'gte';
  const isYN = dir === 'yesno';

  // Compute YTD (sum through current month)
  let ytdGoal = 0, ytdActual = 0;
  for (var m = 1; m <= CUR_MONTH; m++) {
    ytdGoal   += parseFloat(_monthlyData[m] && _monthlyData[m].goal   ? _monthlyData[m].goal   : 0);
    ytdActual += parseFloat(_monthlyData[m] && _monthlyData[m].actual ? _monthlyData[m].actual : 0);
  }
  const ytdAutoTL     = trafficLight(ytdActual, ytdGoal, dir);
  const ytdOverrideTL = _monthlyData['ytd'] ? (_monthlyData['ytd'].tl || '') : '';

  // FY Forecast — find latest entered value
  var fyForecast = '';
  for (var fm = 12; fm >= 1; fm--) {
    if (_monthlyData[fm] && _monthlyData[fm].fyForecast !== '' && _monthlyData[fm].fyForecast !== undefined) {
      fyForecast = _monthlyData[fm].fyForecast; break;
    }
  }
  // FY goal = target.fyGoal (the annual target set on the target itself)
  const fyGoal        = target.fyGoal || '';
  const fyAutoTL      = trafficLight(fyForecast, fyGoal, dir);
  const fyOverrideTL  = _monthlyData['fy'] ? (_monthlyData['fy'].tl || '') : '';

  var rows = '';
  for (var mo = 1; mo <= 12; mo++) {
    const d       = _monthlyData[mo] || {goal:'', actual:'', tl:''};
    const autoTL  = trafficLight(d.actual, d.goal, dir);
    const overTL  = d.tl || '';
    const isPast  = mo <= CUR_MONTH;
    const mIdx    = mo; // capture for closure
    var gVal = (d.goal===undefined||d.goal===null) ? '' : String(d.goal);
    var aVal = (d.actual===undefined||d.actual===null) ? '' : String(d.actual);
    rows += '<tr style="' + (!isPast?'opacity:.45':'') + '">'
      + '<td style="padding:7px 8px;font-weight:600;color:var(--muted);width:46px">' + MONTHS[mo-1] + '</td>'
      + '<td style="padding:4px 6px">' + (isYN
          ? '<span style="color:var(--dim);font-size:12px">Yes/No</span>'
          : '<input type="text" value="' + esc(gVal) + '" placeholder="—" style="padding:5px 8px;font-size:13px;width:100%" onchange="setMonthlyVal(' + mIdx + ',\'goal\',this.value)">'
        ) + '</td>'
      + '<td style="padding:4px 6px">' + (isYN
          ? '<select style="padding:5px 8px;font-size:13px;width:100%" onchange="setMonthlyVal(' + mIdx + ',\'actual\',this.value)"><option value="0" ' + ((d.actual==0||d.actual==='')?'selected':'') + '>No</option><option value="1" ' + (d.actual>=1?'selected':'') + '>Yes</option></select>'
          : '<input type="text" value="' + esc(aVal) + '" placeholder="—" style="padding:5px 8px;font-size:13px;width:100%" onchange="setMonthlyVal(' + mIdx + ',\'actual\',this.value)">'
        ) + '</td>'
      + '<td style="padding:4px 8px;text-align:center">'
        + tlDropdown(autoTL, overTL, 'setMonthlyVal(' + mIdx + ',\'tl\',this.value)')
      + '</td>'
      + '</tr>';
  }

  document.getElementById('modal-monthly-body').innerHTML =
    '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<thead><tr style="font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border)">'
    + '<th style="padding:6px 8px;text-align:left;width:46px">Month</th>'
    + '<th style="padding:6px 8px;text-align:left">Goal</th>'
    + '<th style="padding:6px 8px;text-align:left">Actual</th>'
    + '<th style="padding:6px 8px;text-align:center;width:140px">Status</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '<tfoot>'
    // YTD row
    + '<tr style="border-top:2px solid var(--border);background:var(--bg3)">'
    + '<td style="padding:8px;font-weight:700;color:var(--accent)">YTD</td>'
    + '<td style="padding:8px;font-weight:600">' + (isYN?'—':(ytdGoal||'—')) + '</td>'
    + '<td style="padding:8px;font-weight:600">' + (isYN?'—':(ytdActual||'—')) + '</td>'
    + '<td style="padding:8px">' + tlDropdown(ytdAutoTL, ytdOverrideTL, "setMonthlyVal('ytd','tl',this.value)") + '</td>'
    + '</tr>'
    // FY Forecast row
    + '<tr style="background:var(--bg3)">'
    + '<td style="padding:8px;font-weight:700;color:var(--purple)">FY<br>Forecast</td>'
    + '<td style="padding:8px;color:var(--muted);font-size:12px">' + esc(String(fyGoal||'—')) + '<br><span style="color:var(--dim);font-size:10px">FY Target</span></td>'
    + '<td style="padding:8px">' + (isYN
        ? '<select style="padding:5px 8px;font-size:13px" onchange="setFyForecast(this.value)"><option value="0" ' + ((fyForecast==0||fyForecast==='')?'selected':'') + '>No</option><option value="1" ' + (fyForecast>=1?'selected':'') + '>Yes</option></select>'
        : '<input type="text" value="' + esc(String(fyForecast)) + '" placeholder="Enter FY forecast" style="padding:5px 8px;font-size:13px;width:140px" onchange="setFyForecast(this.value)">'
      ) + '</td>'
    + '<td style="padding:8px">' + tlDropdown(fyAutoTL, fyOverrideTL, "setMonthlyVal('fy','tl',this.value)") + '</td>'
    + '</tr>'
    + '</tfoot>'
    + '</table></div>';
}

function setMonthlyVal(month, field, value) {
  if (!_monthlyData[month]) _monthlyData[month] = {};
  _monthlyData[month][field] = value;
  const target = _targets.find(function(t){ return t.id === _monthlyTargetId; });
  if (target) renderMonthlyModal(target,
    document.getElementById('target-emp').value,
    parseInt(document.getElementById('target-year').value)
  );
}

function setFyForecast(value) {
  // Store in latest month
  if (!_monthlyData[CUR_MONTH]) _monthlyData[CUR_MONTH] = {};
  _monthlyData[CUR_MONTH].fyForecast = value;
}

async function saveMonthlyData() {
  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);
  const tId   = _monthlyTargetId;
  const btn   = document.getElementById('btn-save-monthly');
  btn.textContent = 'Saving…'; btn.disabled = true;

  // Save months 1-12
  const monthEntries = Object.entries(_monthlyData).filter(function(e){ return !isNaN(parseInt(e[0])); });
  const saves = monthEntries.map(async function(entry) {
    const m = entry[0], d = entry[1];
    const docId = empId + '_' + year + '_' + m;
    const snap  = await db.collection('actuals').doc(docId).get();
    const base  = snap.exists ? snap.data() : { empId, year, month: parseInt(m) };
    const actuals   = Object.assign({}, base.actuals   || {}, {[tId]: { value: parseFloat(d.actual)||0 }});
    const plans     = Object.assign({}, base.plans     || {}, {[tId]: { value: parseFloat(d.goal)||0 }});
    const forecasts = Object.assign({}, base.forecasts || {}, {[tId]: { fyForecast: parseFloat(d.fyForecast)||0 }});
    const tlOver    = Object.assign({}, base.trafficOverride || {}, {[tId]: d.tl || ''});
    return db.collection('actuals').doc(docId).set(
      Object.assign({}, base, { actuals, plans, forecasts, trafficOverride: tlOver,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
    );
  });

  // Save YTD + FY override traffic lights separately in a meta doc
  const metaId = empId + '_' + year + '_meta';
  const metaSnap = await db.collection('actuals').doc(metaId).get();
  const metaBase = metaSnap.exists ? metaSnap.data() : { empId, year, type:'meta' };
  const ytdTlOver = Object.assign({}, metaBase.ytdTrafficOverride || {});
  const fyTlOver  = Object.assign({}, metaBase.fyTrafficOverride  || {});
  if (_monthlyData['ytd']) ytdTlOver[tId] = _monthlyData['ytd'].tl || '';
  if (_monthlyData['fy'])  fyTlOver[tId]  = _monthlyData['fy'].tl  || '';
  saves.push(db.collection('actuals').doc(metaId).set(
    Object.assign({}, metaBase, { ytdTrafficOverride: ytdTlOver, fyTrafficOverride: fyTlOver,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
  ));

  await Promise.all(saves);
  btn.textContent = '✓ Saved!'; btn.style.background = 'var(--green)'; btn.style.color = '#0a0c10';
  setTimeout(function() {
    btn.textContent = 'Save'; btn.style.background=''; btn.style.color=''; btn.disabled=false;
    document.getElementById('modal-monthly').classList.remove('open');
  }, 1500);
}

// ── Project KPI Modal ──
function openKpiModal(targetId) {
  _editingKpiTargetId = targetId;
  const t = _targets.find(x=>x.id===targetId);
  _tempKpis = t.kpis && t.kpis.length ? JSON.parse(JSON.stringify(t.kpis)) : [blankKpi()];
  document.getElementById('modal-kpis-title').textContent = 'KPIs for: ' + (t.name||'Project');
  renderKpiRows();
  openModal('modal-kpis');
}

function blankKpi() { return {id:uid(), name:'', description:'', fyGoal:'', weight:0, direction:'gte'}; }

// ── KEY FIX: never re-render DOM on text input — only update weight bar ──
function syncKpisFromDOM() {
  _tempKpis = _tempKpis.map(function(k) {
    var nameEl  = document.getElementById('kn-'+k.id);
    var descEl  = document.getElementById('kd-'+k.id);
    var goalEl  = document.getElementById('kg-'+k.id);
    var wEl     = document.getElementById('kw-'+k.id);
    var dirEl   = document.getElementById('kdir-'+k.id);
    return {
      id:        k.id,
      name:      nameEl  ? nameEl.value  : k.name,
      description: descEl? descEl.value  : k.description,
      fyGoal:    goalEl  ? goalEl.value  : k.fyGoal,
      weight:    wEl     ? (parseFloat(wEl.value)||0) : k.weight,
      direction: dirEl   ? dirEl.value   : k.direction,
    };
  });
}

function updateKpiWeightBar() {
  syncKpisFromDOM();
  var total = _tempKpis.reduce(function(s,k){ return s+(k.weight||0); }, 0);
  var ok = Math.abs(total-100) < 0.01;
  var ws = document.getElementById('kpi-weight-status');
  if (ws) {
    ws.className = 'weight-status ' + (ok?'weight-ok':'weight-bad');
    ws.innerHTML = (ok?'✓':'⚠') + ' Total: <strong>'+total+'%</strong>' + (!ok?' — must equal 100%':'');
  }
  var btn = document.getElementById('btn-save-kpis');
  if (btn) btn.disabled = !ok || _tempKpis.some(function(k){ return !k.name.trim(); });
}

function renderKpiRows() {
  // Only called on open, add, remove, distribute — NOT on text input
  var total = _tempKpis.reduce(function(s,k){ return s+(parseFloat(k.weight)||0); },0);
  var ok = Math.abs(total-100)<0.01;
  var ws = document.getElementById('kpi-weight-status');
  if (ws) { ws.className='weight-status '+(ok?'weight-ok':'weight-bad'); ws.innerHTML=(ok?'✓':'⚠')+' Total: <strong>'+total+'%</strong>'+(!ok?' — must equal 100%':''); }
  var addBtn = document.getElementById('btn-add-kpi');
  if (addBtn) addBtn.style.display = _tempKpis.length>=5?'none':'';
  var saveBtn = document.getElementById('btn-save-kpis');
  if (saveBtn) saveBtn.disabled = !ok || _tempKpis.some(function(k){ return !k.name.trim(); });

  document.getElementById('kpi-rows').innerHTML = _tempKpis.map(function(k,i) {
    return '<div style="display:grid;grid-template-columns:1fr 120px 130px 70px 90px auto;gap:8px;align-items:end;padding:12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);margin-bottom:8px">'
      +'<div class="form-group"><label class="form-label">KPI '+(i+1)+' Name</label>'
      +'<input id="kn-'+k.id+'" value="'+esc(k.name)+'" placeholder="e.g. Bookings $" oninput="updateKpiWeightBar()"></div>'
      +'<div class="form-group"><label class="form-label">FY Goal</label>'
      +'<input id="kg-'+k.id+'" value="'+esc(k.fyGoal||'')+'" placeholder="e.g. $5M"></div>'
      +'<div class="form-group"><label class="form-label">Achievement</label>'
      +'<select id="kdir-'+k.id+'" onchange="updateKpiWeightBar()" style="font-size:12px">'
      +'<option value="gte" '+(( k.direction||'gte')==='gte'?'selected':'')+'>≥ Equal or greater</option>'
      +'<option value="lte" '+(k.direction==='lte'?'selected':'')+'>≤ Equal or lower</option>'
      +'<option value="yesno" '+(k.direction==='yesno'?'selected':'')+'>✓ Yes / No</option>'
      +'</select></div>'
      +'<div class="form-group"><label class="form-label">Weight %</label>'
      +'<input id="kw-'+k.id+'" type="number" min="0" max="100" value="'+k.weight+'" oninput="updateKpiWeightBar()"></div>'
      +'<div class="form-group"><label class="form-label">Description</label>'
      +'<input id="kd-'+k.id+'" value="'+esc(k.description||'')+'" placeholder="Optional"></div>'
      +(k.id && _tempKpis.length>1
        ? '<div style="padding-bottom:2px"><button class="icon-btn" onclick="removeKpi(\'' + k.id + '\')">🗑️</button></div>'
        : '<div></div>')
      +'</div>';
  }).join('');
}

function addKpiRow() {
  if (_tempKpis.length>=5) return;
  syncKpisFromDOM();
  _tempKpis.push(blankKpi());
  renderKpiRows();
}

function removeKpi(id) {
  syncKpisFromDOM();
  _tempKpis = _tempKpis.filter(function(k){ return k.id!==id; });
  renderKpiRows();
}

function distributeKpiWeights() {
  syncKpisFromDOM();
  var w = Math.floor(100/_tempKpis.length);
  var rem = 100 - w*_tempKpis.length;
  _tempKpis = _tempKpis.map(function(k,i){ return Object.assign({},k,{weight: i===0?w+rem:w}); });
  renderKpiRows();
}

function saveKpis() {
  syncKpisFromDOM();
  _targets = _targets.map(function(t){
    return t.id===_editingKpiTargetId ? Object.assign({},t,{kpis:_tempKpis}) : t;
  });
  closeModal('modal-kpis');
  renderTargetsList();
}

// ═══════════════════════════════════════════════════════
// TRACKING PAGE
// ═══════════════════════════════════════════════════════
async function loadTracking() {
  let empId = document.getElementById('track-emp').value;
  const year  = parseInt(document.getElementById('track-year').value);
  const month = parseInt(document.getElementById('track-month').value);

  // If user role, force to own employee profile
  if (!can('canManageTargets') && _currentProfile?.employeeId) {
    empId = _currentProfile.employeeId;
  }

  const content = document.getElementById('tracking-content');
  if (!empId) { content.innerHTML=`<div class="empty"><div class="empty-icon">📈</div><h3>Select an employee above</h3></div>`; return; }
  content.innerHTML=`<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const [planSnap, actualSnap] = await Promise.all([
    db.collection('targetPlans').doc(`${empId}_${year}`).get(),
    db.collection('actuals').doc(`${empId}_${year}_${month}`).get()
  ]);

  _trackTargets   = planSnap.exists?(planSnap.data().targets||[]):[];
  _trackActuals   = actualSnap.exists?(actualSnap.data().actuals||{}):{};
  _trackPlans     = actualSnap.exists?(actualSnap.data().plans||{}):{};
  _trackForecasts = actualSnap.exists?(actualSnap.data().forecasts||{}):{};

  if (!_trackTargets.length) {
    content.innerHTML=`<div class="empty"><div class="empty-icon">🎯</div><h3>No targets configured</h3><p style="color:var(--muted);margin-top:6px">Set up targets in the Targets section first</p></div>`;
    return;
  }
  renderTrackingTable(empId, month);
}

function renderTrackingTable(empId, period) {
  const emp = _employees.find(e => e.id === empId);
  const canPlan = can('canManageTargets');
  const isYtd = period === 'ytd';
  const isFy  = period === 'fy';
  const isMonth = !isYtd && !isFy;
  const month = isMonth ? parseInt(period) : null;
  const mLabel = isYtd ? 'YTD (cumulative)' : isFy ? 'FY Forecast' : MONTHS[month-1];
  const planLabel   = isFy ? 'FY Plan (total)' : isYtd ? 'YTD Plan' : `Plan (${mLabel})`;
  const actualLabel = isFy ? 'FY Forecast'     : isYtd ? 'YTD Actual' : `Actual (${mLabel})`;
  const cols = 'grid-template-columns:1fr 130px 140px 80px';

  const emp0 = emp||{};
  const hue = fullName(emp0).charCodeAt(0)*13%360;
  let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <div style="width:34px;height:34px;border-radius:50%;background:hsl(${hue},55%,35%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff">${(fullName(emp0)[0]||'?').toUpperCase()}</div>
    <div><div style="font-weight:600">${esc(fullName(emp0))}</div><div style="font-size:12px;color:var(--muted)">${mLabel} · ${document.getElementById('track-year').value}</div></div>
  </div>
  <div style="display:grid;${cols};gap:10px;padding:6px 14px;font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">
    <span>Target / KPI</span>
    <span>${planLabel}${!canPlan&&isMonth?' <span style="color:var(--dim);font-weight:400;font-size:9px">read-only</span>':''}</span>
    <span>${actualLabel}</span>
    <span>Achiev.</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">`;

  _trackTargets.forEach(function(target) {
    const isProject = target.type==='project';
    const dir = target.direction || 'higher';
    const isYN = dir==='yesno';
    const pVal = _trackPlans[target.id] ? _trackPlans[target.id].value : '';
    const aVal = isFy
      ? (_trackForecasts[target.id] ? _trackForecasts[target.id].fyForecast : '')
      : (_trackActuals[target.id]   ? _trackActuals[target.id].value        : '');
    const ach = isYN
      ? (aVal===''?null:aVal>=1?100:0)
      : (pVal!==''&&aVal!==''?calcKpiAch(parseFloat(aVal),parseFloat(pVal),dir):null);
    const dirIcon = dir==='higher'?'↑':dir==='lower'?'↓':'✓';
    const achDisp = ach===null?'—':(isYN?(ach>=100?'✓ Yes':'✗ No'):ach+'%');

    html += `<div class="card-sm" style="padding:0;overflow:hidden"><div style="display:grid;${cols};gap:10px;padding:11px 14px;align-items:center">
      <div>
        <div style="font-weight:600;font-size:13px">${esc(target.name)} <span style="font-size:10px;color:var(--dim)">${dirIcon}</span></div>
        <div style="font-size:11px;color:var(--muted)">${isProject?('Project · '+(target.kpis?target.kpis.length:0)+' KPIs'):('KPI · '+(target.unit||'value'))} <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent);font-size:10px">${target.weight}%</span></div>
      </div>`;

    if (isProject) {
      html += `<span style="color:var(--dim);font-size:12px">See KPIs ↓</span><span style="color:var(--dim);font-size:12px">See KPIs ↓</span><span style="color:var(--dim)">—</span>`;
    } else if (isYN) {
      const selActType = isFy?'forecast':'actual';
      html += `<div style="color:var(--dim);font-size:12px;padding:6px 0">Yes / No</div>
        <select style="padding:6px 10px" onchange="setTrackVal('${selActType}','${target.id}',null,this.value)">
          <option value="0" ${(aVal==0||aVal==='')?'selected':''}>No — not achieved</option>
          <option value="1" ${(aVal>=1)?'selected':''}>Yes — achieved</option>
        </select>`;
    } else {
      const actType = isFy?'forecast':'actual';
      const readonlyPlan = (!canPlan&&isMonth)?'readonly style="padding:6px 10px;opacity:.5"':'style="padding:6px 10px"';
      html += `<input type="number" value="${pVal}" placeholder="0" ${readonlyPlan} oninput="setTrackVal('plan','${target.id}',null,this.value)">
        <input type="number" value="${aVal}" placeholder="0" style="padding:6px 10px" oninput="setTrackVal('${actType}','${target.id}',null,this.value)">`;
    }
    html += `<span style="font-family:var(--font-h);font-weight:700;font-size:14px;color:${achColor(ach)}">${achDisp}</span>`;
    html += `</div>`;

    if (isProject && target.kpis && target.kpis.length) {
      target.kpis.forEach(function(kpi) {
        const kdir = kpi.direction||'higher';
        const kIsYN = kdir==='yesno';
        const kp = _trackPlans[target.id] && _trackPlans[target.id][kpi.id] ? _trackPlans[target.id][kpi.id].value : '';
        const ka = isFy
          ? (_trackForecasts[target.id]&&_trackForecasts[target.id][kpi.id] ? _trackForecasts[target.id][kpi.id].fyForecast : '')
          : (_trackActuals[target.id]&&_trackActuals[target.id][kpi.id]     ? _trackActuals[target.id][kpi.id].value         : '');
        const kAch = kIsYN?(ka===''?null:ka>=1?100:0):(kp!==''&&ka!==''?calcKpiAch(parseFloat(ka),parseFloat(kp),kdir):null);
        const kdIcon = kdir==='higher'?'↑':kdir==='lower'?'↓':'✓';
        const kActType = isFy?'forecast':'actual';
        const kAchDisp = kAch===null?'—':(kIsYN?(kAch>=100?'✓':'✗'):kAch+'%');
        html += `<div style="display:grid;${cols};gap:10px;padding:9px 14px 9px 34px;border-top:1px solid var(--border);background:var(--bg3);align-items:center">
          <div><div style="font-size:12px">${esc(kpi.name)} <span style="font-size:9px;color:var(--dim)">${kdIcon}</span></div><div style="font-size:11px;color:var(--dim)">${kpi.unit||'value'} · ${kpi.weight}%</div></div>`;
        if (kIsYN) {
          html += `<div style="color:var(--dim);font-size:12px">Yes / No</div>
            <select style="padding:5px 9px;font-size:13px" onchange="setTrackVal('${kActType}','${target.id}','${kpi.id}',this.value)">
              <option value="0" ${(ka==0||ka==='')?'selected':''}>No</option>
              <option value="1" ${ka>=1?'selected':''}>Yes</option>
            </select>`;
        } else {
          const kReadonly = (!canPlan&&isMonth)?'readonly style="padding:5px 9px;font-size:13px;opacity:.5"':'style="padding:5px 9px;font-size:13px"';
          html += `<input type="number" value="${kp}" placeholder="0" ${kReadonly} oninput="setTrackVal('plan','${target.id}','${kpi.id}',this.value)">
            <input type="number" value="${ka}" placeholder="0" style="padding:5px 9px;font-size:13px" oninput="setTrackVal('${kActType}','${target.id}','${kpi.id}',this.value)">`;
        }
        html += `<span style="font-family:var(--font-h);font-weight:700;font-size:13px;color:${achColor(kAch)}">${kAchDisp}</span></div>`;
      });
    }
    html += `</div>`;
  });

  const saveLabel = isFy?'FY Forecast':isYtd?'YTD':MONTHS[month-1];
  html += `</div><div style="margin-top:20px;display:flex;justify-content:flex-end">`;
  html += isYtd
    ? `<span style="color:var(--muted);font-size:13px">YTD is read-only — edit individual months to update</span>`
    : `<button class="btn btn-primary" onclick="saveTracking('${empId}','${period}')" id="btn-save-track">💾 Save ${saveLabel} Data</button>`;
  html += `</div>`;
  document.getElementById('tracking-content').innerHTML = html;
}

async function saveTracking(empId, period) {
  const year  = parseInt(document.getElementById('track-year').value);
  const isFy  = period === 'fy';
  const month = isFy ? CUR_MONTH : parseInt(period);
  const btn   = document.getElementById('btn-save-track');
  btn.textContent='Saving…'; btn.disabled=true;
  const docId = `${empId}_${year}_${month}`;
  const existing = await db.collection('actuals').doc(docId).get();
  const base = existing.exists ? existing.data() : {empId,year,month};
  await db.collection('actuals').doc(docId).set({
    ...base,
    actuals:   isFy ? (base.actuals||{})   : _trackActuals,
    plans:     isFy ? (base.plans||{})     : _trackPlans,
    forecasts: _trackForecasts,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  const label = isFy?'FY Forecast':MONTHS[month-1];
  btn.textContent='✓ Saved!'; btn.style.background='var(--green)'; btn.style.color='#0a0c10';
  setTimeout(function(){btn.textContent='💾 Save '+label+' Data';btn.style.background='';btn.style.color='';btn.disabled=false;},2500);
}



// ═══════════════════════════════════════════════════════
// MY DASHBOARD (personal view)
// ═══════════════════════════════════════════════════════
async function loadMyDashboard() {
  const year  = parseInt(document.getElementById('my-dash-year').value);
  const empId = _currentProfile?.employeeId;
  const content= document.getElementById('my-dash-content');
  document.getElementById('my-dash-subtitle').textContent = `${MONTHS[CUR_MONTH-1]} ${year}`;

  if (!empId) {
    content.innerHTML=`<div class="empty"><div class="empty-icon">🔗</div><h3>No employee profile linked</h3><p style="color:var(--muted);margin-top:6px">Ask your administrator to link your account to an employee profile.</p></div>`;
    return;
  }

  content.innerHTML=`<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const empData = await buildEmpDashData(_employees.find(e=>e.id===empId)||{id:empId,name:'Me'}, year);
  const emp = empData;

  const hue = fullName(emp).charCodeAt(0)*13%360;
  let html=`
    <div style="max-width:680px">
      <div class="dash-card fade">
        <div class="dash-card-header" style="background:linear-gradient(135deg,hsl(${hue},40%,12%),var(--bg2))">
          <div style="width:44px;height:44px;border-radius:50%;background:hsl(${hue},55%,35%);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0">${(fullName(emp)[0]||'?').toUpperCase()}</div>
          <div style="flex:1"><div style="font-weight:700;font-size:15px">${esc(fullName(emp))}</div><div style="font-size:12px;color:var(--muted)">${esc(emp.role||'')} · ${esc(emp.department||'')}</div></div>
        </div>
        ${emp.ytd!==null?`
          <div class="dash-scores">
            ${scoreCell(emp.mtd,'MTD')}${scoreCell(emp.ytd,'YTD')}${scoreCell(emp.forecast,'FY Fcst')}
          </div>
          <div style="padding:14px 16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <span style="font-size:12px;color:var(--muted)">YTD Progress toward target</span>
              <span style="font-size:12px;color:${achColor(emp.ytd)};font-weight:600">${achLabel(emp.ytd)}</span>
            </div>
            <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${Math.min(100,emp.ytd)}%;background:${achColor(emp.ytd)}"></div></div>
          </div>`:`<div style="padding:20px;text-align:center;color:var(--dim);font-size:13px">No targets configured yet</div>`}
        ${emp.trend?.length>0?`
          <div style="padding:0 16px 16px">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Monthly performance trend</div>
            <div class="trend-bar" style="height:60px">
              ${emp.trend.map(t=>`<div class="trend-bar-item" style="height:${Math.max(8,Math.round(t.s/Math.max(...emp.trend.map(x=>x.s),1)*100))}%;background:${achColor(t.s)};opacity:.8" title="${t.m}: ${t.s}%"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:3px">
              ${emp.trend.map(t=>`<span style="font-size:9px;color:var(--dim);flex:1;text-align:center">${t.m}</span>`).join('')}
            </div>
          </div>`:''}
        ${emp.targets?.length?`
          <div class="dash-targets">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Your Targets</div>
            ${emp.targets.map(t=>`
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                <span style="color:var(--dim);font-size:11px">›</span>
                <span style="font-size:13px;flex:1">${esc(t.name)}</span>
                ${t.description?`<span style="font-size:11px;color:var(--dim)">${esc(t.description)}</span>`:''}
                <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent)">${t.weight}%</span>
                <span class="badge" style="background:${t.type==='project'?'rgba(183,148,244,.1)':'rgba(104,211,145,.1)'};color:${t.type==='project'?'var(--purple)':'var(--green)'}">${t.type==='project'?'Project':'KPI'}</span>
              </div>`).join('')}
          </div>`:''}
      </div>
    </div>`;
  content.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// FULL DASHBOARD
// ═══════════════════════════════════════════════════════
async function loadDashboard() {
  const year = parseInt(document.getElementById('dash-year').value);
  document.getElementById('dash-content').innerHTML=`<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const allActualsSnap = await db.collection('actuals').where('year','==',year).get();
  const allActuals={};
  allActualsSnap.docs.forEach(d=>{const r=d.data();if(!allActuals[r.empId])allActuals[r.empId]={};allActuals[r.empId][r.month]=r;});

  _dashData = await Promise.all(_employees.map(emp => buildEmpDashData(emp, year, allActuals[emp.id]||{})));
  renderDashboard();
}

async function buildEmpDashData(emp, year, empActuals) {
  if (!empActuals) {
    const snap = await db.collection('actuals').where('empId','==',emp.id).where('year','==',year).get();
    empActuals={};
    snap.docs.forEach(d=>{const r=d.data();empActuals[r.month]=r;});
  }
  const planSnap = await db.collection('targetPlans').doc(`${emp.id}_${year}`).get();
  const targets  = planSnap.exists?(planSnap.data().targets||[]):[];
  if (!targets.length) return {...emp,targets,mtd:null,ytd:null,forecast:null,trend:[]};

  const mtdA=empActuals[CUR_MONTH]?.actuals||{}, mtdP=empActuals[CUR_MONTH]?.plans||{};
  const mtd=calcScore(targets,mtdA,mtdP);

  const ytdA={},ytdP={};
  targets.forEach(t=>{
    if(t.type==='kpi'){let a=0,p=0;for(let m=1;m<=CUR_MONTH;m++){a+=empActuals[m]?.actuals?.[t.id]?.value??0;p+=empActuals[m]?.plans?.[t.id]?.value??0;}ytdA[t.id]={value:a};ytdP[t.id]={value:p};}
    else{ytdA[t.id]={};ytdP[t.id]={};t.kpis?.forEach(k=>{let a=0,p=0;for(let m=1;m<=CUR_MONTH;m++){a+=empActuals[m]?.actuals?.[t.id]?.[k.id]?.value??0;p+=empActuals[m]?.plans?.[t.id]?.[k.id]?.value??0;}ytdA[t.id][k.id]={value:a};ytdP[t.id][k.id]={value:p};});}
  });
  const ytd=calcScore(targets,ytdA,ytdP);

  const lastM=Math.max(...Object.keys(empActuals).map(Number).filter(n=>n>0),0);
  const fRec=lastM>0?empActuals[lastM]?.forecasts||{}:{};
  const fyA={},fyP={};
  targets.forEach(t=>{
    if(t.type==='kpi'){let p=0;for(let m=1;m<=12;m++)p+=empActuals[m]?.plans?.[t.id]?.value??0;fyA[t.id]={value:fRec[t.id]?.fyForecast??0};fyP[t.id]={value:p};}
    else{fyA[t.id]={};fyP[t.id]={};t.kpis?.forEach(k=>{let p=0;for(let m=1;m<=12;m++)p+=empActuals[m]?.plans?.[t.id]?.[k.id]?.value??0;fyA[t.id][k.id]={value:fRec[t.id]?.[k.id]?.fyForecast??0};fyP[t.id][k.id]={value:p};});}
  });
  const forecast=calcScore(targets,fyA,fyP);

  const trend=[];
  for(let m=1;m<=CUR_MONTH;m++){const s=calcScore(targets,empActuals[m]?.actuals||{},empActuals[m]?.plans||{});trend.push({m:MONTHS[m-1],s});}

  return {...emp,targets,mtd,ytd,forecast,trend};
}

function renderDashboard() {
  const deptFilter=document.getElementById('dash-dept').value;
  const year=document.getElementById('dash-year').value;
  document.getElementById('dash-subtitle').textContent=`Performance overview · ${MONTHS[CUR_MONTH-1]} ${year}`;
  const filtered=deptFilter==='all'?_dashData:_dashData.filter(e=>e.department===deptFilter);

  if (_dashData.length===0){document.getElementById('dash-content').innerHTML=`<div class="empty"><div class="empty-icon">📈</div><h3>No data yet</h3></div>`;return;}

  const depts=[...new Set(_dashData.map(e=>e.department).filter(Boolean))];
  let html='';

  if (deptFilter==='all'&&depts.length>0){
    html+=`<div style="margin-bottom:6px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">🏢 Department Summary</div><div class="dept-cards">`;
    depts.forEach(dept=>{
      const emps=_dashData.filter(e=>e.department===dept&&e.ytd!==null);
      if(!emps.length){html+=`<div class="dept-card"><div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">${esc(dept)}</div><div style="color:var(--dim);font-size:12px">No data</div></div>`;return;}
      const avgYtd=Math.round(emps.reduce((s,e)=>s+e.ytd,0)/emps.length);
      const avgFy=Math.round(emps.reduce((s,e)=>s+(e.forecast||0),0)/emps.length);
      html+=`<div class="dept-card"><div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">${esc(dept)}</div>
        <div style="font-family:var(--font-h);font-size:26px;font-weight:800;color:${achColor(avgYtd)}">${avgYtd}%</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">YTD Average</div>
        <div class="progress-bar" style="height:4px;margin-bottom:8px"><div class="progress-fill" style="width:${Math.min(100,avgYtd)}%;background:${achColor(avgYtd)}"></div></div>
        <div style="font-size:11px;color:var(--dim)">${emps.length} member${emps.length!==1?'s':''} · FY: <span style="color:${achColor(avgFy)}">${avgFy}%</span></div>
      </div>`;
    });
    html+=`</div>`;
  }

  html+=`<div style="margin-bottom:12px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">👤 Individual Performance — ${filtered.length} people</div>`;
  html+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">`;
  filtered.forEach(emp=>{
    const hue=fullName(emp).charCodeAt(0)*13%360;
    const maxT=Math.max(...emp.trend.map(t=>t.s),1);
    html+=`<div class="dash-card fade">
      <div class="dash-card-header" style="background:linear-gradient(135deg,hsl(${hue},40%,12%),var(--bg2))">
        <div style="width:42px;height:42px;border-radius:50%;background:hsl(${hue},55%,35%);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0">${(fullName(emp)[0]||'?').toUpperCase()}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:15px">${esc(fullName(emp))}</div><div style="font-size:12px;color:var(--muted)">${esc(emp.role||'')}</div></div>
        <span class="badge badge-superuser" style="background:rgba(183,148,244,.1)">${esc(emp.department||'—')}</span>
      </div>
      ${emp.ytd!==null?`
        <div class="dash-scores">${scoreCell(emp.mtd,'MTD')}${scoreCell(emp.ytd,'YTD')}${scoreCell(emp.forecast,'FY Fcst')}</div>
        <div style="padding:12px 14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;color:var(--muted)">YTD Progress</span>
            <span style="font-size:11px;color:${achColor(emp.ytd)};font-weight:600">${achLabel(emp.ytd)}</span>
          </div>
          <div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${Math.min(100,emp.ytd)}%;background:${achColor(emp.ytd)}"></div></div>
        </div>`:`<div style="padding:16px;text-align:center;color:var(--dim);font-size:12px">No targets or data yet</div>`}
      ${emp.trend.length>0?`
        <div style="padding:0 14px 12px">
          <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Monthly trend</div>
          <div class="trend-bar">${emp.trend.map(t=>`<div class="trend-bar-item" style="height:${Math.max(8,Math.round(t.s/maxT*100))}%;background:${achColor(t.s)};opacity:.8" title="${t.m}: ${t.s}%"></div>`).join('')}</div>
        </div>`:''}
      ${emp.targets?.length?`
        <div class="dash-targets">
          <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Targets</div>
          ${emp.targets.map(t=>`<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
            <span style="color:var(--dim);font-size:11px">›</span>
            <span style="font-size:12px;flex:1;color:var(--muted)">${esc(t.name)}</span>
            <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent)">${t.weight}%</span>
            <span class="badge" style="background:${t.type==='project'?'rgba(183,148,244,.1)':'rgba(104,211,145,.1)'};color:${t.type==='project'?'var(--purple)':'var(--green)'}">${t.type==='project'?'Project':'KPI'}</span>
          </div>`).join('')}
        </div>`:''}
    </div>`;
  });
  html+=`</div>`;
  document.getElementById('dash-content').innerHTML=html;
}

function scoreCell(val,label){
  if(val===null)return`<div class="dash-score-cell"><div style="color:var(--dim);font-size:11px">No data</div><div class="score-label">${label}</div></div>`;
  return`<div class="dash-score-cell"><div class="score-big" style="color:${achColor(val)}">${val}%</div><div class="score-label">${label}</div></div>`;
}

// ═══════════════════════════════════════════════════════
// CALCULATIONS & UTILS
// ═══════════════════════════════════════════════════════
function calcScore(targets,actuals,plans){
  if(!targets?.length)return 0;
  let w=0;
  targets.forEach(t=>{
    let s=0;
    if(t.type==='kpi'){const a=actuals[t.id]?.value??0,p=plans[t.id]?.value??0;s=p>0?Math.round((a/p)*100):0;}
    else if(t.kpis?.length){let ww=0;t.kpis.forEach(k=>{const a=actuals[t.id]?.[k.id]?.value??0,p=plans[t.id]?.[k.id]?.value??0;ww+=(p>0?Math.round((a/p)*100):0)*(k.weight/100);});s=Math.round(ww);}
    w+=s*(t.weight/100);
  });
  return Math.round(w);
}

function achColor(v){if(v===null||v===undefined)return'var(--dim)';if(v>=100)return'var(--green)';if(v>=90)return'#76e4b5';if(v>=80)return'var(--accent)';if(v>=70)return'var(--orange)';return'var(--red)';}
function achLabel(v){if(v>=100)return'On Track';if(v>=80)return'Near Target';if(v>=60)return'At Risk';return'Below Target';}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
