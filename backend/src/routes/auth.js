const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// Login do terminal de ponto: CNPJ da empresa + senha compartilhada.
// Depois disso, cada colaborador se identifica pelo reconhecimento facial na hora de bater o ponto.
router.post('/kiosk-login', (req, res) => {
  const { cnpj, password } = req.body;
  if (!cnpj || !password) return res.status(400).json({ error: 'CNPJ e senha são obrigatórios' });

  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  const company = db.prepare('SELECT * FROM company WHERE id = 1').get();
  if (!company || company.cnpj !== cleanCnpj || !bcrypt.compareSync(password, company.password_hash)) {
    return res.status(401).json({ error: 'CNPJ ou senha inválidos' });
  }

  const token = jwt.sign({ role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '16h' });
  res.json({ token });
});

// Login do DP/administrador: e-mail + senha, dá acesso ao painel e relatórios.
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

  const admin = db
    .prepare("SELECT * FROM employees WHERE email = ? AND role = 'admin' AND active = 1")
    .get(email);
  if (!admin || !admin.password_hash || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: admin.id, name: admin.name, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, employee: { id: admin.id, name: admin.name, role: 'admin' } });
});

module.exports = router;
