const API_BASE = window.PONTO_API_BASE || '/api';
const app = document.getElementById('app');

const state = {
  token: localStorage.getItem('ponto_token') || null,
  employee: JSON.parse(localStorage.getItem('ponto_employee') || 'null'),
};

function saveSession(token, employee) {
  state.token = token;
  state.employee = employee;
  localStorage.setItem('ponto_token', token);
  localStorage.setItem('ponto_employee', JSON.stringify(employee));
}
function clearSession() {
  state.token = null;
  state.employee = null;
  localStorage.removeItem('ponto_token');
  localStorage.removeItem('ponto_employee');
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!(opts.body instanceof FormData) && opts.body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

const TYPE_LABELS = {
  entrada: 'Entrada',
  saida_almoco: 'Saída para almoço',
  volta_almoco: 'Volta do almoço',
  saida: 'Saída',
};

function render(html) { app.innerHTML = html; }

function clockLine() {
  const el = document.createElement('div');
  el.className = 'punch-clock';
  const tick = () => (el.textContent = new Date().toLocaleTimeString('pt-BR'));
  tick();
  setInterval(tick, 1000);
  return el;
}

// ---------- Login ----------
function renderLogin(error) {
  render(`
    <h1>⏰ Ponto Hope</h1>
    <div class="card">
      <form id="login-form">
        ${error ? `<div class="error">${error}</div>` : ''}
        <label class="muted">CPF</label>
        <input id="cpf" inputmode="numeric" placeholder="Somente números" required />
        <label class="muted">Senha</label>
        <input id="password" type="password" required />
        <button type="submit">Entrar</button>
      </form>
    </div>
    <p class="muted center">Hope Consultoria · marcação de ponto com foto</p>
  `);
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cpf = document.getElementById('cpf').value;
    const password = document.getElementById('password').value;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { cpf, password } });
      saveSession(data.token, data.employee);
      route();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

// ---------- Employee: bater ponto ----------
async function renderEmployeeHome() {
  render(`
    <div class="topbar">
      <span class="badge">${state.employee.name}</span>
      <button class="secondary" id="logout">Sair</button>
    </div>
    <h1>Bater ponto</h1>
    <div class="card center" id="clock-wrap"></div>
    <div class="card" id="camera-card">
      <p class="muted center" id="next-type">Carregando...</p>
      <video id="video" autoplay playsinline muted></video>
      <canvas id="canvas" style="display:none"></canvas>
      <img id="preview" class="preview" style="display:none" />
      <div class="row" style="margin-top:10px">
        <button id="capture">📷 Tirar foto</button>
      </div>
      <div class="row" id="confirm-row" style="display:none">
        <button class="secondary" id="retake">Repetir</button>
        <button id="confirm">Confirmar batida</button>
      </div>
      <p class="error" id="punch-error"></p>
    </div>
    <div class="card">
      <h2>Minhas últimas batidas</h2>
      <div id="mine-list" class="muted">Carregando...</div>
    </div>
  `);
  document.getElementById('clock-wrap').appendChild(clockLine());
  document.getElementById('logout').onclick = () => { clearSession(); route(); };

  let stream;
  let photoBlob = null;
  let coords = null;

  try {
    coords = await new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  } catch { coords = null; }

  const video = document.getElementById('video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
  } catch {
    document.getElementById('punch-error').textContent =
      'Não foi possível acessar a câmera. Permita o uso da câmera para bater o ponto.';
  }

  async function loadStatus() {
    try {
      const { nextType } = await api('/punches/status');
      document.getElementById('next-type').textContent = nextType
        ? `Próxima marcação: ${TYPE_LABELS[nextType]}`
        : 'Todas as marcações de hoje já foram feitas ✅';
      document.getElementById('capture').disabled = !nextType;
      return nextType;
    } catch (e) {
      document.getElementById('next-type').textContent = e.message;
      return null;
    }
  }
  let nextType = await loadStatus();

  document.getElementById('capture').onclick = () => {
    const canvas = document.getElementById('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      photoBlob = blob;
      document.getElementById('preview').src = URL.createObjectURL(blob);
      document.getElementById('preview').style.display = 'block';
      video.style.display = 'none';
      document.getElementById('capture').style.display = 'none';
      document.getElementById('confirm-row').style.display = 'flex';
    }, 'image/jpeg', 0.85);
  };

  document.getElementById('retake').onclick = () => {
    photoBlob = null;
    document.getElementById('preview').style.display = 'none';
    video.style.display = 'block';
    document.getElementById('capture').style.display = 'block';
    document.getElementById('confirm-row').style.display = 'none';
  };

  document.getElementById('confirm').onclick = async () => {
    if (!photoBlob) return;
    const errorEl = document.getElementById('punch-error');
    errorEl.textContent = '';
    const form = new FormData();
    form.append('photo', photoBlob, 'ponto.jpg');
    if (coords) {
      form.append('latitude', coords.lat);
      form.append('longitude', coords.lng);
    }
    try {
      await api('/punches', { method: 'POST', body: form });
      document.getElementById('retake').click();
      nextType = await loadStatus();
      await loadMine();
    } catch (e) {
      errorEl.textContent = e.message;
    }
  };

  async function loadMine() {
    const list = document.getElementById('mine-list');
    try {
      const rows = await api('/punches/mine');
      if (!rows.length) { list.textContent = 'Nenhuma batida registrada ainda.'; return; }
      list.innerHTML = `<table><tbody>${rows
        .slice(0, 8)
        .map((r) => `<tr><td>${TYPE_LABELS[r.type]}</td><td>${new Date(r.timestamp).toLocaleString('pt-BR')}</td></tr>`)
        .join('')}</tbody></table>`;
    } catch (e) {
      list.textContent = e.message;
    }
  }
  loadMine();
}

// ---------- Admin: painel DP ----------
async function renderAdminHome() {
  render(`
    <div id="app-inner" class="wide"></div>
  `);
  const inner = document.getElementById('app-inner');
  inner.innerHTML = `
    <div class="topbar">
      <span class="badge">DP · ${state.employee.name}</span>
      <div class="row" style="max-width:220px">
        <button class="secondary" id="to-mine">Bater meu ponto</button>
        <button class="secondary" id="logout">Sair</button>
      </div>
    </div>
    <h1>Painel do DP</h1>
    <div class="card">
      <h2>Relatório para fechamento de folha</h2>
      <div class="row">
        <div>
          <label class="muted">De</label>
          <input type="date" id="from" />
        </div>
        <div>
          <label class="muted">Até</label>
          <input type="date" id="to" />
        </div>
      </div>
      <label class="muted">Colaborador (opcional)</label>
      <select id="employee-filter"><option value="">Todos</option></select>
      <div class="row">
        <button id="run-report">Gerar relatório</button>
        <button class="secondary" id="download-csv">Baixar CSV</button>
      </div>
      <div id="report-result" class="muted">Selecione um período e gere o relatório.</div>
    </div>
    <div class="card">
      <h2>Colaboradores</h2>
      <div id="employees-list" class="muted">Carregando...</div>
      <h2>Novo colaborador</h2>
      <form id="new-employee-form">
        <input id="ne-name" placeholder="Nome completo" required />
        <input id="ne-cpf" placeholder="CPF (somente números)" required />
        <input id="ne-email" placeholder="E-mail (opcional)" />
        <input id="ne-password" type="password" placeholder="Senha provisória" required />
        <select id="ne-role">
          <option value="employee">Colaborador</option>
          <option value="admin">DP / Administrador</option>
        </select>
        <button type="submit">Cadastrar colaborador</button>
        <p class="error" id="ne-error"></p>
      </form>
    </div>
  `;

  document.getElementById('logout').onclick = () => { clearSession(); route(); };
  document.getElementById('to-mine').onclick = () => renderEmployeeHome();

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  document.getElementById('from').value = firstOfMonth;
  document.getElementById('to').value = today;

  async function loadEmployees() {
    const rows = await api('/employees');
    const select = document.getElementById('employee-filter');
    select.innerHTML = '<option value="">Todos</option>' + rows
      .map((e) => `<option value="${e.id}">${e.name}${e.active ? '' : ' (inativo)'}</option>`)
      .join('');
    const list = document.getElementById('employees-list');
    list.innerHTML = `<table><thead><tr><th>Nome</th><th>CPF</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map(
        (e) => `<tr>
          <td>${e.name}</td><td>${e.cpf}</td><td>${e.role === 'admin' ? 'DP' : 'Colaborador'}</td>
          <td>${e.active ? 'Ativo' : 'Inativo'}</td>
          <td><button class="secondary toggle-active" data-id="${e.id}" data-active="${e.active}" style="width:auto;padding:6px 10px">${e.active ? 'Desativar' : 'Ativar'}</button></td>
        </tr>`
      )
      .join('')}</tbody></table>`;
    list.querySelectorAll('.toggle-active').forEach((btn) => {
      btn.onclick = async () => {
        await api(`/employees/${btn.dataset.id}`, {
          method: 'PATCH',
          body: { active: btn.dataset.active === '0' },
        });
        loadEmployees();
      };
    });
  }
  loadEmployees();

  document.getElementById('new-employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('ne-error');
    errorEl.textContent = '';
    try {
      await api('/employees', {
        method: 'POST',
        body: {
          name: document.getElementById('ne-name').value,
          cpf: document.getElementById('ne-cpf').value,
          email: document.getElementById('ne-email').value,
          password: document.getElementById('ne-password').value,
          role: document.getElementById('ne-role').value,
        },
      });
      e.target.reset();
      loadEmployees();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  function reportQuery() {
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const employeeId = document.getElementById('employee-filter').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (employeeId) params.set('employeeId', employeeId);
    return params.toString();
  }

  document.getElementById('run-report').onclick = async () => {
    const resultEl = document.getElementById('report-result');
    resultEl.textContent = 'Gerando...';
    try {
      const rows = await api(`/reports?${reportQuery()}`);
      if (!rows.length) { resultEl.textContent = 'Nenhum registro no período.'; return; }
      resultEl.innerHTML = `<table><thead><tr>
        <th>Colaborador</th><th>Data</th><th>Entrada</th><th>Saída almoço</th><th>Volta almoço</th><th>Saída</th><th>Horas</th>
      </tr></thead><tbody>${rows
        .map(
          (r) => `<tr>
            <td>${r.colaborador}</td><td>${r.data}</td><td>${r.entrada}</td>
            <td>${r.saida_almoco}</td><td>${r.volta_almoco}</td><td>${r.saida}</td><td>${r.horas_trabalhadas}</td>
          </tr>`
        )
        .join('')}</tbody></table>`;
    } catch (e) {
      resultEl.textContent = e.message;
    }
  };

  document.getElementById('download-csv').onclick = () => {
    const url = `${API_BASE}/reports/csv?${reportQuery()}`;
    fetch(url, { headers: { Authorization: `Bearer ${state.token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'relatorio_ponto.csv';
        a.click();
      });
  };
}

function route() {
  if (!state.token || !state.employee) return renderLogin();
  if (state.employee.role === 'admin') return renderAdminHome();
  return renderEmployeeHome();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

route();
