const API_BASE = window.PONTO_API_BASE || '/api';
const FACE_MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const app = document.getElementById('app');

const state = {
  token: localStorage.getItem('ponto_token') || null,
  role: localStorage.getItem('ponto_role') || null, // 'kiosk' | 'admin'
  admin: JSON.parse(localStorage.getItem('ponto_admin') || 'null'),
};

function saveSession(token, role, admin) {
  state.token = token;
  state.role = role;
  state.admin = admin || null;
  localStorage.setItem('ponto_token', token);
  localStorage.setItem('ponto_role', role);
  localStorage.setItem('ponto_admin', JSON.stringify(admin || null));
}
function clearSession() {
  state.token = null;
  state.role = null;
  state.admin = null;
  localStorage.removeItem('ponto_token');
  localStorage.removeItem('ponto_role');
  localStorage.removeItem('ponto_admin');
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

// ---------- Reconhecimento facial (face-api.js roda 100% no navegador) ----------
let modelsPromise = null;
function loadFaceModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
    ]);
  }
  return modelsPromise;
}

async function detectDescriptor(mediaEl) {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const result = await faceapi
    .detectSingleFace(mediaEl, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ? Array.from(result.descriptor) : null;
}

function captureFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

// ---------- Login ----------
function renderKioskLogin(error) {
  render(`
    <div class="logo-wrap"><img src="logo.jpg" alt="Hope Consultoria" /></div>
    <h1>⏰ Marcador de Ponto</h1>
    <div class="card">
      <form id="login-form">
        ${error ? `<div class="error">${error}</div>` : ''}
        <label class="muted">CNPJ da empresa</label>
        <input id="cnpj" inputmode="numeric" placeholder="Somente números" required />
        <label class="muted">Senha</label>
        <input id="password" type="password" required />
        <button type="submit">Entrar no terminal de ponto</button>
      </form>
    </div>
    <p class="muted center">Após entrar, cada colaborador é identificado pelo rosto na hora de bater o ponto.</p>
    <p class="muted center"><a href="#" id="admin-link">Acesso do DP</a></p>
  `);
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cnpj = document.getElementById('cnpj').value;
    const password = document.getElementById('password').value;
    try {
      const data = await api('/auth/kiosk-login', { method: 'POST', body: { cnpj, password } });
      saveSession(data.token, 'kiosk', null);
      route();
    } catch (err) {
      renderKioskLogin(err.message);
    }
  });
  document.getElementById('admin-link').onclick = (e) => { e.preventDefault(); renderAdminLogin(); };
}

function renderAdminLogin(error) {
  render(`
    <div class="logo-wrap"><img src="logo.jpg" alt="Hope Consultoria" /></div>
    <h1>Acesso do DP</h1>
    <div class="card">
      <form id="admin-login-form">
        ${error ? `<div class="error">${error}</div>` : ''}
        <label class="muted">E-mail</label>
        <input id="email" type="email" required />
        <label class="muted">Senha</label>
        <input id="password" type="password" required />
        <button type="submit">Entrar</button>
      </form>
    </div>
    <p class="muted center"><a href="#" id="back-link">Voltar para o terminal de ponto</a></p>
  `);
  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      saveSession(data.token, 'admin', data.employee);
      route();
    } catch (err) {
      renderAdminLogin(err.message);
    }
  });
  document.getElementById('back-link').onclick = (e) => { e.preventDefault(); renderKioskLogin(); };
}

// ---------- Terminal: reconhecimento facial + bater ponto ----------
async function renderKioskHome() {
  render(`
    <div class="topbar">
      <img src="logo.jpg" alt="Hope Consultoria" class="logo-small" />
      <span class="badge">Terminal de ponto</span>
      <button class="secondary" id="logout">Sair</button>
    </div>
    <div class="card center" id="clock-wrap"></div>
    <div class="card" id="camera-card">
      <p class="muted center" id="status-text">Carregando reconhecimento facial...</p>
      <video id="video" autoplay playsinline muted></video>
      <img id="preview" class="preview" style="display:none" />
      <div id="recognized-box" class="recognized-box" style="display:none"></div>
      <div class="row" style="margin-top:10px">
        <button id="scan" disabled>👤 Reconhecer meu rosto</button>
      </div>
      <div class="row" id="confirm-row" style="display:none">
        <button class="secondary" id="cancel">Cancelar</button>
        <button id="confirm">Confirmar batida</button>
      </div>
      <p class="error" id="punch-error"></p>
    </div>
    <p class="muted center">A foto é obrigatória e fica guardada apenas para conferência do DP.</p>
  `);
  document.getElementById('clock-wrap').appendChild(clockLine());
  document.getElementById('logout').onclick = () => { clearSession(); route(); };

  const statusText = document.getElementById('status-text');
  const scanBtn = document.getElementById('scan');
  const video = document.getElementById('video');
  const preview = document.getElementById('preview');
  const recognizedBox = document.getElementById('recognized-box');
  const errorEl = document.getElementById('punch-error');

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

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
  } catch {
    statusText.textContent = 'Não foi possível acessar a câmera. Permita o uso da câmera para bater o ponto.';
    return;
  }

  try {
    await loadFaceModels();
    statusText.textContent = 'Posicione o rosto na câmera e toque em "Reconhecer meu rosto".';
    scanBtn.disabled = false;
  } catch {
    statusText.textContent = 'Não foi possível carregar o reconhecimento facial. Verifique a conexão com a internet.';
    return;
  }

  let capturedCanvas = null;
  let recognized = null; // { employeeId, name, descriptor, nextType }

  scanBtn.onclick = async () => {
    errorEl.textContent = '';
    scanBtn.disabled = true;
    statusText.textContent = 'Reconhecendo...';
    try {
      const descriptor = await detectDescriptor(video);
      if (!descriptor) {
        statusText.textContent = 'Não encontrei um rosto. Aproxime-se da câmera e tente de novo.';
        scanBtn.disabled = false;
        return;
      }
      const match = await api('/punches/recognize', { method: 'POST', body: { descriptor } });
      recognized = { employeeId: match.employeeId, name: match.name, descriptor, nextType: match.nextType };

      capturedCanvas = captureFrame(video);
      preview.src = capturedCanvas.toDataURL('image/jpeg', 0.85);
      preview.style.display = 'block';
      video.style.display = 'none';

      recognizedBox.style.display = 'block';
      recognizedBox.innerHTML = match.nextType
        ? `<strong>${match.name}</strong><br/>Marcação: ${TYPE_LABELS[match.nextType]}`
        : `<strong>${match.name}</strong><br/>Todas as marcações de hoje já foram feitas ✅`;

      statusText.textContent = '';
      document.getElementById('confirm-row').style.display = 'flex';
      document.getElementById('confirm').disabled = !match.nextType;
    } catch (err) {
      statusText.textContent = err.message;
      scanBtn.disabled = false;
    }
  };

  function resetToScan() {
    recognized = null;
    capturedCanvas = null;
    preview.style.display = 'none';
    video.style.display = 'block';
    recognizedBox.style.display = 'none';
    document.getElementById('confirm-row').style.display = 'none';
    scanBtn.disabled = false;
    statusText.textContent = 'Posicione o rosto na câmera e toque em "Reconhecer meu rosto".';
  }

  document.getElementById('cancel').onclick = resetToScan;

  document.getElementById('confirm').onclick = async () => {
    if (!recognized || !capturedCanvas) return;
    errorEl.textContent = '';
    document.getElementById('confirm').disabled = true;
    try {
      const blob = await canvasToBlob(capturedCanvas);
      const form = new FormData();
      form.append('photo', blob, 'ponto.jpg');
      form.append('employeeId', recognized.employeeId);
      form.append('descriptor', JSON.stringify(recognized.descriptor));
      if (coords) {
        form.append('latitude', coords.lat);
        form.append('longitude', coords.lng);
      }
      const result = await api('/punches', { method: 'POST', body: form });
      recognizedBox.innerHTML = `<strong>${result.name}</strong><br/>${TYPE_LABELS[result.type]} registrada às ${new Date().toLocaleTimeString('pt-BR')} ✅`;
      document.getElementById('confirm-row').style.display = 'none';
      setTimeout(resetToScan, 3000);
    } catch (err) {
      errorEl.textContent = err.message;
      document.getElementById('confirm').disabled = false;
    }
  };
}

// ---------- Admin: painel DP ----------
async function renderAdminHome() {
  render(`<div id="app-inner" class="wide"></div>`);
  const inner = document.getElementById('app-inner');
  inner.innerHTML = `
    <div class="topbar">
      <img src="logo.jpg" alt="Hope Consultoria" class="logo-small" />
      <span class="badge">DP · ${state.admin?.name || ''}</span>
      <div class="row" style="max-width:220px">
        <button class="secondary" id="to-kiosk">Terminal de ponto</button>
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
      <p class="muted">A foto de cadastro é usada para reconhecer o colaborador na hora de bater o ponto — capriche na iluminação e enquadre bem o rosto.</p>
      <form id="new-employee-form">
        <input id="ne-name" placeholder="Nome completo" required />
        <input id="ne-cpf" placeholder="CPF (somente números)" required />
        <input id="ne-email" placeholder="E-mail (opcional)" />
        <select id="ne-role">
          <option value="employee">Colaborador (bate ponto por reconhecimento facial)</option>
          <option value="admin">DP / Administrador (login por e-mail e senha)</option>
        </select>
        <div id="ne-admin-password" style="display:none">
          <input id="ne-password" type="password" placeholder="Senha do DP" />
        </div>
        <div id="ne-face-fields">
          <label class="muted">Foto do colaborador (rosto de frente, bem iluminado)</label>
          <input id="ne-photo" type="file" accept="image/*" />
          <img id="ne-photo-preview" class="preview" style="display:none;margin-bottom:10px" />
          <button type="button" id="ne-detect" class="secondary">Detectar rosto na foto</button>
          <p class="muted" id="ne-face-status"></p>
        </div>
        <button type="submit">Cadastrar colaborador</button>
        <p class="error" id="ne-error"></p>
      </form>
    </div>
  `;

  document.getElementById('logout').onclick = () => { clearSession(); route(); };
  document.getElementById('to-kiosk').onclick = () => { clearSession(); renderKioskLogin(); };

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
    list.innerHTML = `<table><thead><tr><th>Nome</th><th>CPF</th><th>Perfil</th><th>Rosto cadastrado</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map(
        (e) => `<tr>
          <td>${e.name}</td><td>${e.cpf}</td><td>${e.role === 'admin' ? 'DP' : 'Colaborador'}</td>
          <td>${e.role === 'admin' ? '-' : (e.has_face ? 'Sim ✅' : 'Não ⚠️')}</td>
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

  const roleSelect = document.getElementById('ne-role');
  const adminPasswordWrap = document.getElementById('ne-admin-password');
  const faceFields = document.getElementById('ne-face-fields');
  roleSelect.onchange = () => {
    const isAdmin = roleSelect.value === 'admin';
    adminPasswordWrap.style.display = isAdmin ? 'block' : 'none';
    faceFields.style.display = isAdmin ? 'none' : 'block';
  };

  const photoInput = document.getElementById('ne-photo');
  const photoPreview = document.getElementById('ne-photo-preview');
  const faceStatus = document.getElementById('ne-face-status');
  let faceDescriptor = null;

  photoInput.onchange = () => {
    faceDescriptor = null;
    faceStatus.textContent = '';
    const file = photoInput.files[0];
    if (!file) return;
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.style.display = 'block';
  };

  document.getElementById('ne-detect').onclick = async () => {
    if (!photoInput.files[0]) {
      faceStatus.textContent = 'Selecione uma foto primeiro.';
      return;
    }
    faceStatus.textContent = 'Carregando reconhecimento facial...';
    try {
      await loadFaceModels();
      faceStatus.textContent = 'Detectando rosto...';
      const descriptor = await detectDescriptor(photoPreview);
      if (!descriptor) {
        faceStatus.textContent = 'Não encontrei um rosto nessa foto. Tente outra, de frente e bem iluminada.';
        return;
      }
      faceDescriptor = descriptor;
      faceStatus.textContent = 'Rosto detectado com sucesso ✅';
    } catch (err) {
      faceStatus.textContent = err.message;
    }
  };

  document.getElementById('new-employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('ne-error');
    errorEl.textContent = '';
    const isAdmin = roleSelect.value === 'admin';
    if (!isAdmin && !faceDescriptor) {
      errorEl.textContent = 'Clique em "Detectar rosto na foto" antes de cadastrar o colaborador.';
      return;
    }
    try {
      const form = new FormData();
      form.append('name', document.getElementById('ne-name').value);
      form.append('cpf', document.getElementById('ne-cpf').value);
      form.append('email', document.getElementById('ne-email').value);
      form.append('role', roleSelect.value);
      if (isAdmin) {
        form.append('password', document.getElementById('ne-password').value);
      } else {
        form.append('photo', photoInput.files[0]);
        form.append('descriptor', JSON.stringify(faceDescriptor));
      }
      await api('/employees', { method: 'POST', body: form });
      e.target.reset();
      faceDescriptor = null;
      photoPreview.style.display = 'none';
      faceStatus.textContent = '';
      adminPasswordWrap.style.display = 'none';
      faceFields.style.display = 'block';
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
  if (!state.token || !state.role) return renderKioskLogin();
  if (state.role === 'admin') return renderAdminHome();
  return renderKioskHome();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

route();
