const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  const employee = db
    .prepare('SELECT id, name, cpf, email, role FROM employees WHERE id = ?')
    .get(req.user.id);
  res.json(employee);
});

// DP/admin: listar colaboradores
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const employees = db
    .prepare('SELECT id, name, cpf, email, role, active FROM employees ORDER BY name')
    .all();
  res.json(employees);
});

// DP/admin: cadastrar colaborador
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, cpf, email, password, role } = req.body;
  if (!name || !cpf || !password) {
    return res.status(400).json({ error: 'Nome, CPF e senha são obrigatórios' });
  }
  const cleanCpf = String(cpf).replace(/\D/g, '');
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare(
        'INSERT INTO employees (name, cpf, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
      )
      .run(name, cleanCpf, email || null, hash, role === 'admin' ? 'admin' : 'employee');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'CPF já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao cadastrar colaborador' });
  }
});

// DP/admin: ativar/desativar colaborador
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const { active, name, email, password, role } = req.body;
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Colaborador não encontrado' });

  db.prepare(
    `UPDATE employees SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      active = COALESCE(?, active),
      password_hash = COALESCE(?, password_hash)
     WHERE id = ?`
  ).run(
    name ?? null,
    email ?? null,
    role ?? null,
    active === undefined ? null : (active ? 1 : 0),
    password ? bcrypt.hashSync(password, 10) : null,
    req.params.id
  );

  res.json({ ok: true });
});

module.exports = router;
