const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) return res.status(400).json({ error: 'CPF e senha são obrigatórios' });

  const cleanCpf = String(cpf).replace(/\D/g, '');
  const employee = db.prepare('SELECT * FROM employees WHERE cpf = ? AND active = 1').get(cleanCpf);
  if (!employee) return res.status(401).json({ error: 'Credenciais inválidas' });

  const valid = bcrypt.compareSync(password, employee.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign(
    { id: employee.id, name: employee.name, role: employee.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    employee: { id: employee.id, name: employee.name, role: employee.role },
  });
});

module.exports = router;
