const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const uploadsPath = process.env.UPLOADS_PATH || './uploads';
fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `punch_${req.user.id}_${stamp}${ext}`);
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

router.get('/status', requireAuth, (req, res) => {
  res.json({ nextType: nextPunchType(req.user.id) });
});

router.post('/', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Foto é obrigatória para registrar o ponto' });

  const type = nextPunchType(req.user.id);
  if (!type) {
    fs.unlink(req.file.path, () => {});
    return res.status(409).json({ error: 'Todas as batidas do dia já foram registradas' });
  }

  const { latitude, longitude } = req.body;
  const info = db
    .prepare(
      `INSERT INTO punches (employee_id, type, photo_path, latitude, longitude)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      type,
      path.basename(req.file.path),
      latitude ? Number(latitude) : null,
      longitude ? Number(longitude) : null
    );

  res.status(201).json({ id: info.lastInsertRowid, type });
});

router.get('/mine', requireAuth, (req, res) => {
  const { from, to } = req.query;
  let query = 'SELECT id, type, timestamp, latitude, longitude FROM punches WHERE employee_id = ?';
  const params = [req.user.id];
  if (from) {
    query += ' AND date(timestamp) >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND date(timestamp) <= ?';
    params.push(to);
  }
  query += ' ORDER BY timestamp DESC LIMIT 200';
  res.json(db.prepare(query).all(...params));
});

module.exports = router;
