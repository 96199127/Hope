const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireKioskOrAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadsPath = process.env.UPLOADS_PATH || './uploads';
fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `punch_${stamp}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Arquivo deve ser uma imagem'));
    cb(null, true);
  },
});

const VALID_TYPES = ['entrada', 'saida_almoco', 'volta_almoco', 'saida'];
const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.5);

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function findBestMatch(companyId, descriptor) {
  const candidates = db
    .prepare(
      "SELECT id, name, face_descriptor FROM employees WHERE company_id = ? AND active = 1 AND face_descriptor IS NOT NULL"
    )
    .all(companyId);

  let best = null;
  for (const c of candidates) {
    let stored;
    try {
      stored = JSON.parse(c.face_descriptor);
    } catch {
      continue;
    }
    if (!Array.isArray(stored) || stored.length !== descriptor.length) continue;
    const distance = euclideanDistance(stored, descriptor);
    if (!best || distance < best.distance) best = { id: c.id, name: c.name, distance };
  }
  return best;
}

// Próximo tipo de batida esperado para o colaborador no dia atual
function nextPunchType(employeeId) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT type FROM punches WHERE employee_id = ? AND date(timestamp) = ? ORDER BY timestamp ASC`
    )
    .all(employeeId, today);
  const doneTypes = rows.map((r) => r.type);
  for (const t of VALID_TYPES) {
    if (!doneTypes.includes(t)) return t;
  }
  return null; // todas as 4 batidas já feitas hoje
}

// Identifica o colaborador a partir do vetor facial calculado no navegador na hora da batida
router.post('/recognize', requireAuth, requireKioskOrAdmin, (req, res) => {
  const { descriptor } = req.body;
  if (!Array.isArray(descriptor) || descriptor.length < 64) {
    return res.status(400).json({ error: 'Rosto não detectado corretamente, tente novamente' });
  }

  const best = findBestMatch(req.user.companyId, descriptor);
  if (!best || best.distance > MATCH_THRESHOLD) {
    return res.status(404).json({ error: 'Rosto não reconhecido. Procure o DP para revisar seu cadastro.' });
  }

  res.json({
    employeeId: best.id,
    name: best.name,
    distance: best.distance,
    nextType: nextPunchType(best.id),
  });
});

// Registra a batida: confere de novo o rosto contra o colaborador identificado e salva a foto
router.post('/', requireAuth, requireKioskOrAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Foto é obrigatória para registrar o ponto' });

  const cleanup = () => fs.unlink(req.file.path, () => {});

  const employeeId = Number(req.body.employeeId);
  let descriptor;
  try {
    descriptor = JSON.parse(req.body.descriptor);
  } catch {
    cleanup();
    return res.status(400).json({ error: 'Dados do reconhecimento facial inválidos' });
  }
  if (!employeeId || !Array.isArray(descriptor)) {
    cleanup();
    return res.status(400).json({ error: 'Dados do reconhecimento facial inválidos' });
  }

  const employee = db
    .prepare('SELECT id, name, face_descriptor FROM employees WHERE id = ? AND company_id = ? AND active = 1')
    .get(employeeId, req.user.companyId);
  if (!employee || !employee.face_descriptor) {
    cleanup();
    return res.status(404).json({ error: 'Colaborador não encontrado' });
  }

  const distance = euclideanDistance(JSON.parse(employee.face_descriptor), descriptor);
  if (distance > MATCH_THRESHOLD) {
    cleanup();
    return res.status(401).json({ error: 'Rosto não confere com o colaborador identificado' });
  }

  const type = nextPunchType(employeeId);
  if (!type) {
    cleanup();
    return res.status(409).json({ error: 'Todas as batidas do dia já foram registradas' });
  }

  const { latitude, longitude } = req.body;
  const info = db
    .prepare(
      `INSERT INTO punches (employee_id, type, photo_path, match_distance, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      employeeId,
      type,
      path.basename(req.file.path),
      distance,
      latitude ? Number(latitude) : null,
      longitude ? Number(longitude) : null
    );

  res.status(201).json({ id: info.lastInsertRowid, type, name: employee.name });
});

module.exports = router;
