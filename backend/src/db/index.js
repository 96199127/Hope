const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || './data/ponto.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cnpj TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'employee', -- 'employee' | 'admin'
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT, -- somente para role = 'admin' (login do DP)
  reference_photo_path TEXT, -- foto de cadastro usada no reconhecimento facial
  face_descriptor TEXT, -- JSON com o vetor facial (128 posicoes) extraido da foto de cadastro
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL, -- 'entrada' | 'saida_almoco' | 'volta_almoco' | 'saida'
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  photo_path TEXT NOT NULL,
  match_distance REAL, -- distancia do reconhecimento facial (quanto menor, mais parecido)
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_punches_employee_time ON punches(employee_id, timestamp);
`);

function ensureCompanyLogin() {
  const cnpj = process.env.COMPANY_CNPJ;
  const password = process.env.COMPANY_PASSWORD;
  if (!cnpj || !password) return;
  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM company WHERE id = 1').get();
  if (existing) {
    db.prepare('UPDATE company SET cnpj = ?, password_hash = ? WHERE id = 1').run(cleanCnpj, hash);
  } else {
    db.prepare('INSERT INTO company (id, cnpj, password_hash) VALUES (1, ?, ?)').run(cleanCnpj, hash);
    console.log('Login do terminal (CNPJ) configurado.');
  }
}

function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email);
  if (existing) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO employees (name, cpf, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`
  ).run('Administrador (DP)', '00000000000', email, hash);
  console.log(`Usuário do DP criado: ${email}`);
}

ensureCompanyLogin();
ensureAdmin();

module.exports = db;
