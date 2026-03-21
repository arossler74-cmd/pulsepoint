// app.js — PulsePoint Performance Management

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NOW = new Date();
const CUR_MONTH = NOW.getMonth() + 1;
const CUR_YEAR  = NOW.getFullYear();

// In-memory cache
let _employees   = [];
let _departments = [];
let _dashData    = [];
let _editingKpiTargetId = null;
let _tempKpis    = [];

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-avatar').textContent = user.email[0].toUpperCase();
    document.getElementById('user-email').textContent = user.email;
    initApp();
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
  }
});

async function doLogin() {
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const err      = document.getElementById('login-error');
  err.style.display = 'none';
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(e) {
    err.style.display = 'flex';
    btn.textContent = 'Sign In →';
    btn.disabled = false;
  }
}

function doLogout() {
  auth.signOut();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initApp() {
  populateYearSelects();
  populateMonthSelect();
  await loadBaseData();
  loadDashboard();
}

function populateYearSelects() {
  const years = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];
  ['dash-year','target-year','track-year'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = years.map(y => `<option value="${y}" ${y===CUR_YEAR?'selected':''}>${y}</option>`).join('');
  });
}

function populateMonthSelect() {
  const el = document.getElementById('track-month');
  el.innerHTML = MONTHS.map((m,i) => `<option value="${i+1}" ${i+1===CUR_MONTH?'selected':''}>${m}</option>`).join('');
}

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
  const sorted = [..._employees].sort((a,b) => a.name.localeCompare(b.name));
  const opts = `<option value="">Choose a person…</option>` +
    sorted.map(e => `<option value="${e.id}">${e.name} — ${e.role}</option>`).join('');
  ['target-emp','track-emp'].forEach(id => {
    document.getElementById(id).innerHTML = opts;
  });
}

function populateDeptSelects() {
  const opts = `<option value="">Select…</option>` +
    _departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  document.getElementById('emp-dept').innerHTML = opts;

  const dashDept = document.getElementById('dash-dept');
  const prev = dashDept.value;
  dashDept.innerHTML = `<option value="all">All Departments</option>` +
    _departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  dashDept.value = prev || 'all';
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'people')   renderPeople();
  if (name === 'targets')  renderTargetsPage();
  if (name === 'tracking') renderTrackingPage();
  if (name === 'dashboard') loadDashboard();
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ─────────────────────────────────────────────
// PEOPLE PAGE
// ─────────────────────────────────────────────
function renderPeople() {
  const content = document.getElementById('people-content');
  document.getElementById('people-subtitle').textContent =
    `${_employees.length} member${_employees.length!==1?'s':''} across ${_departments.length} department${_departments.length!==1?'s':''}`;

  if (_employees.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">👤</div><h3>No people yet</h3><p>Add team members to start tracking performance</p></div>`;
    return;
  }

  // Group by dept
  const byDept = {};
  _employees.forEach(e => {
    const d = e.department || 'Unassigned';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(e);
  });

  content.innerHTML = Object.entries(byDept).map(([dept, emps]) => `
    <div class="dept-section">
      <div class="dept-title">🏢 ${dept} <span style="color:var(--dim);font-weight:400">— ${emps.length} member${emps.length!==1?'s':''}</span></div>
      <div class="emp-grid">
        ${emps.map(emp => `
          <div class="emp-card">
            <div class="emp-avatar" style="background:hsl(${emp.name.charCodeAt(0)*13%360},55%,35%)">${emp.name[0].toUpperCase()}</div>
            <div class="emp-info">
              <div class="emp-name">${emp.name}</div>
              <div class="emp-role">${emp.role}</div>
              ${emp.email ? `<div style="color:var(--dim);font-size:11px;margin-top:1px">${emp.email}</div>` : ''}
            </div>
            <div class="emp-actions">
              <button class="icon-btn" onclick="openEmpModal('${emp.id}')" title="Edit" style="color:var(--muted)">✏️</button>
              <button class="icon-btn" onclick="deleteEmployee('${emp.id}','${emp.name}')" title="Delete">🗑️</button>
            </div>
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
    document.getElementById('emp-name').value  = e.name || '';
    document.getElementById('emp-role').value  = e.role || '';
    document.getElementById('emp-dept').value  = e.department || '';
    document.getElementById('emp-email').value = e.email || '';
  } else {
    document.getElementById('modal-emp-title').textContent = 'Add Person';
    document.getElementById('emp-name').value  = '';
    document.getElementById('emp-role').value  = '';
    document.getElementById('emp-dept').value  = '';
    document.getElementById('emp-email').value = '';
  }
  openModal('modal-emp');
}

async function saveEmployee() {
  const id   = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  const role = document.getElementById('emp-role').value.trim();
  const dept = document.getElementById('emp-dept').value;
  const email= document.getElementById('emp-email').value.trim();
  if (!name || !role || !dept) return alert('Name, role and department are required.');

  const data = { name, role, department: dept, email };
  if (id) {
    await db.collection('employees').doc(id).update(data);
  } else {
    await db.collection('employees').add(data);
  }
  closeModal('modal-emp');
  await loadBaseData();
  renderPeople();
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete ${name}?`)) return;
  await db.collection('employees').doc(id).delete();
  await loadBaseData();
  renderPeople();
}

function openDeptModal() {
  document.getElementById('dept-name').value = '';
  openModal('modal-dept');
}

async function saveDept() {
  const name = document.getElementById('dept-name').value.trim();
  if (!name) return;
  await db.collection('departments').add({ name });
  closeModal('modal-dept');
  await loadBaseData();
  renderPeople();
}

// ─────────────────────────────────────────────
// TARGETS PAGE
// ─────────────────────────────────────────────
let _targets = []; // current employee's targets being edited

function renderTargetsPage() {
  // already rendered via HTML; just make sure selects are populated
}

async function loadTargets() {
  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);
  const content = document.getElementById('targets-content');

  if (!empId) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">🎯</div><h3>Select a person above</h3></div>`;
    return;
  }

  content.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const snap = await db.collection('targetPlans').doc(`${empId}_${year}`).get();
  _targets = snap.exists ? (snap.data().targets || []) : [];
  if (_targets.length === 0) _targets = [blankTarget()];

  renderTargetsList();
}

function blankTarget() {
  return { id: uid(), name: '', type: 'kpi', weight: 0, unit: '', description: '', kpis: [] };
}

function uid() { return Math.random().toString(36).slice(2,10); }

function renderTargetsList() {
  const content = document.getElementById('targets-content');
  const total   = _targets.reduce((s,t) => s + (parseFloat(t.weight)||0), 0);
  const ok      = Math.abs(total - 100) < 0.01;
  const emp     = _employees.find(e => e.id === document.getElementById('target-emp').value);

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:hsl(${emp?.name.charCodeAt(0)*13%360},55%,35%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff">${emp?.name[0]?.toUpperCase()}</div>
        <div><div style="font-weight:600">${emp?.name}</div><div style="font-size:12px;color:var(--muted)">${emp?.role} · ${emp?.department}</div></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="distributeTargetWeights()">Auto-distribute</button>
        ${_targets.length < 5 ? `<button class="btn btn-secondary btn-sm" onclick="addTarget()">+ Add Target</button>` : ''}
      </div>
    </div>

    <div class="${ok?'weight-status weight-ok':'weight-status weight-bad'}" style="margin-bottom:14px">
      ${ok ? '✓' : '⚠'} Total weight: <strong>${total}%</strong>${!ok?' — must equal 100%':''}
    </div>

    <!-- Column headers -->
    <div style="display:grid;grid-template-columns:24px 1fr 1fr 110px 70px 80px 80px;gap:10px;padding:4px 14px;font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
      <span>#</span><span>Target Name</span><span>Description</span><span>Type</span><span>Unit</span><span>Weight %</span><span></span>
    </div>

    <div id="target-rows" style="display:flex;flex-direction:column;gap:6px">
      ${_targets.map((t,i) => renderTargetRow(t,i)).join('')}
    </div>

    <div style="margin-top:20px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveTargets()" id="btn-save-targets">Save Targets</button>
    </div>
  `;
}

function renderTargetRow(t, i) {
  return `
    <div class="card-sm" id="trow-${t.id}">
      <div style="display:grid;grid-template-columns:24px 1fr 1fr 110px 70px 80px 80px;gap:10px;align-items:center">
        <span style="font-size:11px;color:var(--dim);font-weight:700">${i+1}</span>
        <input value="${esc(t.name)}" placeholder="e.g. DC Capacity" oninput="updateTarget('${t.id}','name',this.value)">
        <input value="${esc(t.description)}" placeholder="Optional" oninput="updateTarget('${t.id}','description',this.value)">
        <select onchange="updateTarget('${t.id}','type',this.value)">
          <option value="kpi" ${t.type==='kpi'?'selected':''}>Single KPI</option>
          <option value="project" ${t.type==='project'?'selected':''}>Project</option>
        </select>
        <input value="${esc(t.unit)}" placeholder="%, $" oninput="updateTarget('${t.id}','unit',this.value)">
        <input type="number" min="0" max="100" value="${t.weight}" oninput="updateTarget('${t.id}','weight',this.value)">
        <div style="display:flex;gap:4px;align-items:center">
          ${t.type==='project' ? `<button class="btn btn-ghost btn-sm" onclick="openKpiModal('${t.id}')" title="Configure KPIs" style="padding:4px 8px">⚙️${t.kpis?.length>0?` <span style="color:var(--green)">${t.kpis.length}</span>`:''}</button>` : ''}
          ${_targets.length > 1 ? `<button class="icon-btn" onclick="removeTarget('${t.id}')">🗑️</button>` : ''}
        </div>
      </div>
      ${t.type==='project' && t.kpis?.length>0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          ${t.kpis.map(k => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="color:var(--dim);font-size:11px">›</span>
              <span style="font-size:12px;flex:1;color:var(--muted)">${esc(k.name)}</span>
              ${k.unit?`<span style="font-size:11px;color:var(--dim)">${esc(k.unit)}</span>`:''}
              <span class="badge" style="background:rgba(99,179,237,.12);color:var(--accent)">${k.weight}%</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function updateTarget(id, field, value) {
  _targets = _targets.map(t => t.id === id ? { ...t, [field]: field==='weight'?(parseFloat(value)||0):value } : t);
  // Re-render weight status only
  const total = _targets.reduce((s,t) => s + (parseFloat(t.weight)||0), 0);
  const ok = Math.abs(total - 100) < 0.01;
  const ws = document.querySelector('.weight-status');
  if (ws) {
    ws.className = `weight-status ${ok?'weight-ok':'weight-bad'}`;
    ws.innerHTML = `${ok?'✓':'⚠'} Total weight: <strong>${total}%</strong>${!ok?' — must equal 100%':''}`;
  }
}

function addTarget() {
  if (_targets.length >= 5) return;
  _targets.push(blankTarget());
  renderTargetsList();
}

function removeTarget(id) {
  _targets = _targets.filter(t => t.id !== id);
  renderTargetsList();
}

function distributeTargetWeights() {
  const w = Math.floor(100 / _targets.length);
  const rem = 100 - w * _targets.length;
  _targets = _targets.map((t,i) => ({ ...t, weight: i===0 ? w+rem : w }));
  renderTargetsList();
}

async function saveTargets() {
  const empId = document.getElementById('target-emp').value;
  const year  = parseInt(document.getElementById('target-year').value);
  const total = _targets.reduce((s,t) => s + (parseFloat(t.weight)||0), 0);
  if (Math.abs(total - 100) > 0.01) return alert('Weights must total 100%');
  if (_targets.some(t => !t.name.trim())) return alert('All targets need a name');

  const btn = document.getElementById('btn-save-targets');
  btn.textContent = 'Saving…'; btn.disabled = true;
  await db.collection('targetPlans').doc(`${empId}_${year}`).set({ empId, year, targets: _targets });
  btn.textContent = '✓ Saved!'; btn.style.background = 'var(--green)'; btn.style.color = '#0a0c10';
  setTimeout(() => { btn.textContent = 'Save Targets'; btn.style.background=''; btn.style.color=''; btn.disabled=false; }, 2500);
}

// ─────────────────────────────────────────────
// PROJECT KPI MODAL
// ─────────────────────────────────────────────
function openKpiModal(targetId) {
  _editingKpiTargetId = targetId;
  const t = _targets.find(x => x.id === targetId);
  _tempKpis = t.kpis?.length ? JSON.parse(JSON.stringify(t.kpis)) : [blankKpi()];
  document.getElementById('modal-kpis-title').textContent = `KPIs for: ${t.name || 'Project'}`;
  renderKpiRows();
  openModal('modal-kpis');
}

function blankKpi() { return { id: uid(), name: '', description: '', unit: '', weight: 0 }; }

function renderKpiRows() {
  const total = _tempKpis.reduce((s,k) => s + (parseFloat(k.weight)||0), 0);
  const ok = Math.abs(total - 100) < 0.01;
  document.getElementById('kpi-weight-status').className = `weight-status ${ok?'weight-ok':'weight-bad'}`;
  document.getElementById('kpi-weight-status').innerHTML = `${ok?'✓':'⚠'} Total: <strong>${total}%</strong>${!ok?' — must equal 100%':''}`;
  document.getElementById('btn-add-kpi').style.display = _tempKpis.length >= 5 ? 'none' : '';
  document.getElementById('btn-save-kpis').disabled = !ok || _tempKpis.some(k => !k.name.trim());

  document.getElementById('kpi-rows').innerHTML = _tempKpis.map((k,i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px auto;gap:8px;align-items:end;padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);margin-bottom:6px">
      <div class="form-group">
        <label class="form-label">KPI ${i+1} Name</label>
        <input value="${esc(k.name)}" placeholder="e.g. Conversion Rate" oninput="updateKpi('${k.id}','name',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input value="${esc(k.description||'')}" placeholder="Optional" oninput="updateKpi('${k.id}','description',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <input value="${esc(k.unit||'')}" placeholder="%, $, #" oninput="updateKpi('${k.id}','unit',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Weight %</label>
        <input type="number" min="0" max="100" value="${k.weight}" oninput="updateKpi('${k.id}','weight',this.value)">
      </div>
      <div style="padding-bottom:2px">
        ${_tempKpis.length > 1 ? `<button class="icon-btn" onclick="removeKpi('${k.id}')">🗑️</button>` : ''}
      </div>
    </div>
  `).join('');
}

function addKpiRow() {
  if (_tempKpis.length >= 5) return;
  _tempKpis.push(blankKpi());
  renderKpiRows();
}

function removeKpi(id) {
  _tempKpis = _tempKpis.filter(k => k.id !== id);
  renderKpiRows();
}

function updateKpi(id, field, value) {
  _tempKpis = _tempKpis.map(k => k.id === id ? { ...k, [field]: field==='weight'?(parseFloat(value)||0):value } : k);
  renderKpiRows();
}

function distributeKpiWeights() {
  const w = Math.floor(100 / _tempKpis.length);
  const rem = 100 - w * _tempKpis.length;
  _tempKpis = _tempKpis.map((k,i) => ({ ...k, weight: i===0?w+rem:w }));
  renderKpiRows();
}

function saveKpis() {
  _targets = _targets.map(t => t.id === _editingKpiTargetId ? { ...t, kpis: _tempKpis } : t);
  closeModal('modal-kpis');
  renderTargetsList();
}

// ─────────────────────────────────────────────
// TRACKING PAGE
// ─────────────────────────────────────────────
let _trackActuals   = {};
let _trackPlans     = {};
let _trackForecasts = {};
let _trackTargets   = [];

function renderTrackingPage() { /* selects populated by initApp */ }

async function loadTracking() {
  const empId = document.getElementById('track-emp').value;
  const year  = parseInt(document.getElementById('track-year').value);
  const month = parseInt(document.getElementById('track-month').value);
  const content = document.getElementById('tracking-content');

  if (!empId) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">📈</div><h3>Select an employee above</h3></div>`;
    return;
  }

  content.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const [planSnap, actualSnap] = await Promise.all([
    db.collection('targetPlans').doc(`${empId}_${year}`).get(),
    db.collection('actuals').doc(`${empId}_${year}_${month}`).get()
  ]);

  _trackTargets   = planSnap.exists ? (planSnap.data().targets || []) : [];
  _trackActuals   = actualSnap.exists ? (actualSnap.data().actuals   || {}) : {};
  _trackPlans     = actualSnap.exists ? (actualSnap.data().plans     || {}) : {};
  _trackForecasts = actualSnap.exists ? (actualSnap.data().forecasts || {}) : {};

  if (_trackTargets.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">🎯</div><h3>No targets configured</h3><p style="color:var(--muted);margin-top:6px">Set up targets in the Targets section first</p></div>`;
    return;
  }

  renderTrackingTable();
}

function renderTrackingTable() {
  const empId = document.getElementById('track-emp').value;
  const month = parseInt(document.getElementById('track-month').value);
  const emp   = _employees.find(e => e.id === empId);
  const mLabel= MONTHS[month-1];

  const cols = `grid-template-columns:1fr 120px 120px 130px 80px`;

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:34px;height:34px;border-radius:50%;background:hsl(${emp?.name.charCodeAt(0)*13%360},55%,35%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff">${emp?.name[0]?.toUpperCase()}</div>
      <div><div style="font-weight:600">${emp?.name}</div><div style="font-size:12px;color:var(--muted)">${mLabel} · ${document.getElementById('track-year').value}</div></div>
    </div>
    <div style="display:grid;${cols};gap:10px;padding:6px 14px;font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">
      <span>Target / KPI</span><span>Plan (${mLabel})</span><span>Actual (${mLabel})</span><span>FY Forecast</span><span>Achiev.</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
  `;

  _trackTargets.forEach(target => {
    const isProject = target.type === 'project';
    const pVal = _trackPlans[target.id]?.value ?? '';
    const aVal = _trackActuals[target.id]?.value ?? '';
    const fVal = _trackForecasts[target.id]?.fyForecast ?? '';
    const ach  = pVal!=='' && aVal!=='' && pVal>0 ? Math.round((aVal/pVal)*100) : null;

    html += `<div class="card-sm" style="padding:0;overflow:hidden">`;
    html += `
      <div style="display:grid;${cols};gap:10px;padding:11px 14px;align-items:center">
        <div>
          <div style="font-weight:600;font-size:13px">${esc(target.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${isProject?`Project · ${target.kpis?.length||0} KPIs`:`KPI · ${target.unit||'value'}`} <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent);font-size:10px">${target.weight}%</span></div>
        </div>
    `;

    if (isProject) {
      html += `<span style="color:var(--dim);font-size:12px">See KPIs ↓</span>
               <span style="color:var(--dim);font-size:12px">See KPIs ↓</span>
               <span style="color:var(--dim);font-size:12px">See KPIs ↓</span>
               <span style="color:var(--dim)">—</span>`;
    } else {
      html += `
        <input type="number" value="${pVal}" placeholder="0" style="padding:6px 10px" oninput="setTrackVal('plan','${target.id}',null,this.value)">
        <input type="number" value="${aVal}" placeholder="0" style="padding:6px 10px" oninput="setTrackVal('actual','${target.id}',null,this.value)">
        <input type="number" value="${fVal}" placeholder="0" style="padding:6px 10px" oninput="setTrackVal('forecast','${target.id}',null,this.value)">
        <span class="ach-val" style="color:${achColor(ach)}">${ach!==null?ach+'%':'—'}</span>
      `;
    }
    html += `</div>`;

    // Project sub-KPIs
    if (isProject && target.kpis?.length) {
      target.kpis.forEach(kpi => {
        const kp = _trackPlans[target.id]?.[kpi.id]?.value ?? '';
        const ka = _trackActuals[target.id]?.[kpi.id]?.value ?? '';
        const kf = _trackForecasts[target.id]?.[kpi.id]?.fyForecast ?? '';
        const kAch = kp!=='' && ka!=='' && kp>0 ? Math.round((ka/kp)*100) : null;
        html += `
          <div style="display:grid;${cols};gap:10px;padding:9px 14px 9px 34px;border-top:1px solid var(--border);background:var(--bg3);align-items:center">
            <div>
              <div style="font-size:12px;color:var(--text)">${esc(kpi.name)}</div>
              <div style="font-size:11px;color:var(--dim)">${kpi.unit||'value'} · ${kpi.weight}%</div>
            </div>
            <input type="number" value="${kp}" placeholder="0" style="padding:5px 9px;font-size:13px" oninput="setTrackVal('plan','${target.id}','${kpi.id}',this.value)">
            <input type="number" value="${ka}" placeholder="0" style="padding:5px 9px;font-size:13px" oninput="setTrackVal('actual','${target.id}','${kpi.id}',this.value)">
            <input type="number" value="${kf}" placeholder="0" style="padding:5px 9px;font-size:13px" oninput="setTrackVal('forecast','${target.id}','${kpi.id}',this.value)">
            <span class="ach-val" style="color:${achColor(kAch)};font-size:13px">${kAch!==null?kAch+'%':'—'}</span>
          </div>
        `;
      });
    }
    html += `</div>`;
  });

  html += `</div>
    <div style="margin-top:20px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveTracking()" id="btn-save-track">💾 Save ${mLabel} Data</button>
    </div>`;

  document.getElementById('tracking-content').innerHTML = html;
}

function setTrackVal(type, targetId, kpiId, val) {
  const v = parseFloat(val) || 0;
  if (type === 'plan') {
    if (kpiId) { if(!_trackPlans[targetId])_trackPlans[targetId]={}; _trackPlans[targetId][kpiId]={value:v}; }
    else _trackPlans[targetId] = { ...(_trackPlans[targetId]||{}), value: v };
  } else if (type === 'actual') {
    if (kpiId) { if(!_trackActuals[targetId])_trackActuals[targetId]={}; _trackActuals[targetId][kpiId]={value:v}; }
    else _trackActuals[targetId] = { ...(_trackActuals[targetId]||{}), value: v };
  } else {
    if (kpiId) { if(!_trackForecasts[targetId])_trackForecasts[targetId]={}; _trackForecasts[targetId][kpiId]={fyForecast:v}; }
    else _trackForecasts[targetId] = { ...(_trackForecasts[targetId]||{}), fyForecast: v };
  }
  // update achievement display inline
  if (type !== 'forecast' && !kpiId) {
    const t = _trackTargets.find(x => x.id === targetId);
    if (t && t.type === 'kpi') {
      const pv = _trackPlans[targetId]?.value ?? 0;
      const av = _trackActuals[targetId]?.value ?? 0;
      const ach = pv > 0 ? Math.round((av/pv)*100) : null;
      // find the achievement span — re-render is cheapest
      renderTrackingTable();
    }
  }
}

async function saveTracking() {
  const empId = document.getElementById('track-emp').value;
  const year  = parseInt(document.getElementById('track-year').value);
  const month = parseInt(document.getElementById('track-month').value);
  const btn   = document.getElementById('btn-save-track');
  btn.textContent = 'Saving…'; btn.disabled = true;
  await db.collection('actuals').doc(`${empId}_${year}_${month}`).set({
    empId, year, month,
    actuals:   _trackActuals,
    plans:     _trackPlans,
    forecasts: _trackForecasts,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  btn.textContent = '✓ Saved!'; btn.style.background='var(--green)'; btn.style.color='#0a0c10';
  setTimeout(()=>{ btn.textContent=`💾 Save ${MONTHS[month-1]} Data`; btn.style.background=''; btn.style.color=''; btn.disabled=false; },2500);
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  const year = parseInt(document.getElementById('dash-year').value);
  document.getElementById('dash-content').innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  const allActualsSnap = await db.collection('actuals').where('year','==',year).get();
  const allActuals = {};
  allActualsSnap.docs.forEach(d => {
    const r = d.data();
    if (!allActuals[r.empId]) allActuals[r.empId] = {};
    allActuals[r.empId][r.month] = r;
  });

  _dashData = await Promise.all(_employees.map(async emp => {
    const planSnap = await db.collection('targetPlans').doc(`${emp.id}_${year}`).get();
    const targets  = planSnap.exists ? (planSnap.data().targets || []) : [];
    const empActuals = allActuals[emp.id] || {};

    if (!targets.length) return { ...emp, targets, mtd: null, ytd: null, forecast: null, trend: [] };

    // MTD
    const mtdA = empActuals[CUR_MONTH]?.actuals || {};
    const mtdP = empActuals[CUR_MONTH]?.plans   || {};
    const mtd  = calcScore(targets, mtdA, mtdP);

    // YTD (cumulative)
    const ytdA = {}, ytdP = {};
    targets.forEach(t => {
      if (t.type === 'kpi') {
        let a=0,p=0;
        for (let m=1;m<=CUR_MONTH;m++) { a+=empActuals[m]?.actuals?.[t.id]?.value??0; p+=empActuals[m]?.plans?.[t.id]?.value??0; }
        ytdA[t.id]={value:a}; ytdP[t.id]={value:p};
      } else {
        ytdA[t.id]={}; ytdP[t.id]={};
        t.kpis?.forEach(k => {
          let a=0,p=0;
          for(let m=1;m<=CUR_MONTH;m++){a+=empActuals[m]?.actuals?.[t.id]?.[k.id]?.value??0;p+=empActuals[m]?.plans?.[t.id]?.[k.id]?.value??0;}
          ytdA[t.id][k.id]={value:a}; ytdP[t.id][k.id]={value:p};
        });
      }
    });
    const ytd = calcScore(targets, ytdA, ytdP);

    // FY Forecast
    const lastMonth = Math.max(...Object.keys(empActuals).map(Number).filter(n=>n>0), 0);
    const fRec = lastMonth > 0 ? empActuals[lastMonth]?.forecasts || {} : {};
    const fyA={}, fyP={};
    targets.forEach(t => {
      if (t.type === 'kpi') {
        let p=0; for(let m=1;m<=12;m++) p+=empActuals[m]?.plans?.[t.id]?.value??0;
        fyA[t.id]={value:fRec[t.id]?.fyForecast??0}; fyP[t.id]={value:p};
      } else {
        fyA[t.id]={}; fyP[t.id]={};
        t.kpis?.forEach(k=>{
          let p=0; for(let m=1;m<=12;m++) p+=empActuals[m]?.plans?.[t.id]?.[k.id]?.value??0;
          fyA[t.id][k.id]={value:fRec[t.id]?.[k.id]?.fyForecast??0}; fyP[t.id][k.id]={value:p};
        });
      }
    });
    const forecast = calcScore(targets, fyA, fyP);

    // Monthly trend
    const trend = [];
    for (let m=1;m<=CUR_MONTH;m++) {
      const s = calcScore(targets, empActuals[m]?.actuals||{}, empActuals[m]?.plans||{});
      trend.push({ m: MONTHS[m-1], s });
    }

    return { ...emp, targets, mtd, ytd, forecast, trend };
  }));

  renderDashboard();
}

function renderDashboard() {
  const deptFilter = document.getElementById('dash-dept').value;
  const year = document.getElementById('dash-year').value;
  document.getElementById('dash-subtitle').textContent = `Performance overview · ${MONTHS[CUR_MONTH-1]} ${year}`;

  const filtered = deptFilter === 'all' ? _dashData : _dashData.filter(e => e.department === deptFilter);

  if (_dashData.length === 0) {
    document.getElementById('dash-content').innerHTML = `<div class="empty"><div class="empty-icon">📈</div><h3>No data yet</h3><p style="color:var(--muted);margin-top:6px">Add employees, configure targets, and start tracking</p></div>`;
    return;
  }

  // Dept summary
  const depts = [...new Set(_dashData.map(e=>e.department).filter(Boolean))];
  let html = '';

  if (deptFilter === 'all' && depts.length > 0) {
    html += `<div style="margin-bottom:6px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">🏢 Department Summary</div>
    <div class="dept-cards" style="margin-bottom:28px">`;
    depts.forEach(dept => {
      const emps = _dashData.filter(e => e.department===dept && e.ytd!==null);
      if (!emps.length) { html += `<div class="dept-card"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px">${dept}</div><div style="color:var(--dim);font-size:12px">No data</div></div>`; return; }
      const avgYtd = Math.round(emps.reduce((s,e)=>s+e.ytd,0)/emps.length);
      const avgFy  = Math.round(emps.reduce((s,e)=>s+(e.forecast||0),0)/emps.length);
      html += `
        <div class="dept-card">
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">${dept}</div>
          <div style="font-family:var(--font-h);font-size:26px;font-weight:800;color:${achColor(avgYtd)}">${avgYtd}%</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px">YTD Average</div>
          <div class="progress-bar" style="height:4px;margin-bottom:8px"><div class="progress-fill" style="width:${Math.min(100,avgYtd)}%;background:${achColor(avgYtd)}"></div></div>
          <div style="font-size:11px;color:var(--dim)">${emps.length} member${emps.length!==1?'s':''} · FY: <span style="color:${achColor(avgFy)}">${avgFy}%</span></div>
        </div>`;
    });
    html += `</div>`;
  }

  // Individual cards
  html += `<div style="margin-bottom:12px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">👤 Individual Performance — ${filtered.length} people</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">`;

  filtered.forEach(emp => {
    const hue = emp.name.charCodeAt(0)*13%360;
    const maxTrend = Math.max(...emp.trend.map(t=>t.s), 1);

    html += `
      <div class="dash-card fade">
        <div class="dash-card-header" style="background:linear-gradient(135deg,hsl(${hue},40%,12%),var(--bg2))">
          <div style="width:42px;height:42px;border-radius:50%;background:hsl(${hue},55%,35%);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0">${emp.name[0].toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">${esc(emp.name)}</div>
            <div style="font-size:12px;color:var(--muted)">${esc(emp.role)}</div>
          </div>
          <span class="badge" style="background:rgba(183,148,244,.12);color:var(--purple)">${esc(emp.department||'—')}</span>
        </div>

        ${emp.ytd !== null ? `
          <div class="dash-scores">
            ${scoreCell(emp.mtd,'MTD')}${scoreCell(emp.ytd,'YTD')}${scoreCell(emp.forecast,'FY Fcst')}
          </div>
          <div style="padding:12px 14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:11px;color:var(--muted)">YTD Progress</span>
              <span style="font-size:11px;color:${achColor(emp.ytd)};font-weight:600">${achLabel(emp.ytd)}</span>
            </div>
            <div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${Math.min(100,emp.ytd)}%;background:${achColor(emp.ytd)}"></div></div>
          </div>
        ` : `<div style="padding:16px;text-align:center;color:var(--dim);font-size:12px">No targets or data configured</div>`}

        ${emp.trend.length > 0 ? `
          <div style="padding:0 14px 12px">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Monthly trend</div>
            <div class="trend-bar">
              ${emp.trend.map(t => `<div class="trend-bar-item" style="height:${Math.max(8,Math.round(t.s/maxTrend*100))}%;background:${achColor(t.s)};opacity:.8" title="${t.m}: ${t.s}%"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px">
              <span style="font-size:9px;color:var(--dim)">${emp.trend[0]?.m}</span>
              <span style="font-size:9px;color:var(--dim)">${emp.trend[emp.trend.length-1]?.m}</span>
            </div>
          </div>
        ` : ''}

        ${emp.targets?.length ? `
          <div class="dash-targets">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Targets</div>
            ${emp.targets.map(t=>`
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
                <span style="color:var(--dim);font-size:11px">›</span>
                <span style="font-size:12px;flex:1;color:var(--muted)">${esc(t.name)}</span>
                <span class="badge" style="background:rgba(99,179,237,.1);color:var(--accent)">${t.weight}%</span>
                <span class="badge" style="background:${t.type==='project'?'rgba(183,148,244,.1)':'rgba(104,211,145,.1)'};color:${t.type==='project'?'var(--purple)':'var(--green)'}">${t.type==='project'?'Project':'KPI'}</span>
              </div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  });

  html += `</div>`;
  document.getElementById('dash-content').innerHTML = html;
}

function scoreCell(val, label) {
  if (val === null) return `<div class="dash-score-cell"><div style="color:var(--dim);font-size:11px">No data</div><div class="score-label">${label}</div></div>`;
  return `<div class="dash-score-cell"><div class="score-big" style="color:${achColor(val)}">${val}%</div><div class="score-label">${label}</div></div>`;
}

// ─────────────────────────────────────────────
// CALCULATIONS
// ─────────────────────────────────────────────
function calcScore(targets, actuals, plans) {
  if (!targets?.length) return 0;
  let weighted = 0;
  targets.forEach(t => {
    let score = 0;
    if (t.type === 'kpi') {
      const a = actuals[t.id]?.value ?? 0;
      const p = plans[t.id]?.value ?? 0;
      score = p > 0 ? Math.round((a/p)*100) : 0;
    } else {
      if (!t.kpis?.length) { score=0; }
      else {
        let w=0;
        t.kpis.forEach(k => {
          const a = actuals[t.id]?.[k.id]?.value ?? 0;
          const p = plans[t.id]?.[k.id]?.value ?? 0;
          const s = p > 0 ? Math.round((a/p)*100) : 0;
          w += s * (k.weight/100);
        });
        score = Math.round(w);
      }
    }
    weighted += score * (t.weight/100);
  });
  return Math.round(weighted);
}

function achColor(v) {
  if (v === null || v === undefined) return 'var(--dim)';
  if (v >= 100) return 'var(--green)';
  if (v >= 90)  return '#76e4b5';
  if (v >= 80)  return 'var(--accent)';
  if (v >= 70)  return 'var(--orange)';
  return 'var(--red)';
}

function achLabel(v) {
  if (v >= 100) return 'On Track';
  if (v >= 80)  return 'Near Target';
  if (v >= 60)  return 'At Risk';
  return 'Below Target';
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
