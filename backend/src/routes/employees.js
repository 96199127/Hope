const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadsPath = process.env.UPLOADS_PATH || './uploads';
fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `cadastro_${stamp}${ext}`);
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

// DP/admin: listar colaboradores
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const employees = db
    .prepare(
      `SELECT id, name, cpf, email, role, active,
              (face_descriptor IS NOT NULL) as has_face
       FROM employees ORDER BY name`
    )
    .all();
  res.json(employees);
});

// DP/admin: cadastrar colaborador com a foto de referência para o reconhecimento facial
router.post('/', requireAuth, requireAdmin, upload.single('photo'), (req, res) => {
  const { name, cpf, email, role, descriptor, password } = req.body;
  if (!name || !cpf) {
    return res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
  }
  const isAdmin = role === 'admin';
  if (isAdmin && !password) {
    return res.status(400).json({ error: 'Senha é obrigatória para cadastro do DP' });
  }
  if (!isAdmin && (!req.file || !descriptor)) {
    return res
      .status(400)
      .json({ error: 'Foto do colaborador é obrigatória para habilitar o reconhecimento facial' });
  }

  const cleanCpf = String(cpf).replace(/\D/g, '');
  try {
    const info = db
      .prepare(
        `INSERT INTO employees (name, cpf, email, role, password_hash, reference_photo_path, face_descriptor)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        cleanCpf,
        email || null,
        isAdmin ? 'admin' : 'employee',
        password ? bcrypt.hashSync(password, 10) : null,
        req.file ? path.basename(req.file.path) : null,
        descriptor || null
      );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao cadastrar colaborador' });
  }
});

// DP/admin: atualizar colaborador (ativar/desativar, trocar foto de referência, etc.)
router.patch('/:id', requireAuth, requireAdmin, upload.single('photo'), (req, res) => {
  const { active, name, email, password, role, descriptor } = req.body;
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Colaborador não encontrado' });

  db.prepare(
    `UPDATE employees SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      active = COALESCE(?, active),
      password_hash = COALESCE(?, password_hash),
      reference_photo_path = COALESCE(?, reference_photo_path),
      face_descriptor = COALESCE(?, face_descriptor)
     WHERE id = ?`
  ).run(
    name ?? null,
    email ?? null,
    role ?? null,
    active === undefined ? null : (active ? 1 : 0),
    password ? bcrypt.hashSync(password, 10) : null,
    req.file ? path.basename(req.file.path) : null,
    descriptor ?? null,
    req.params.id
  );

  res.json({ ok: true });
});

module.exports = router;
