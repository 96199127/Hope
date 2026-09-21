const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || './data/ponto.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  tax_regime TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'employee', -- 'employee' | 'admin'
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT, -- somente para role = 'admin' (login do DP)
  reference_photo_path TEXT, -- foto de cadastro usada no reconhecimento facial
  face_descriptor TEXT, -- JSON com o vetor facial (128 posicoes) extraido da foto de cadastro
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, cpf)
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
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
`);

// Cada empresa cliente tem seu proprio login (CNPJ + senha) para o terminal de ponto.
// Cadastre novas empresas definindo COMPANY_2_*, COMPANY_3_* etc no .env (veja .env.example).
function upsertCompany({ name, cnpj, password, phone, city, taxRegime }) {
  if (!name || !cnpj || !password) return null;
  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM companies WHERE cnpj = ?').get(cleanCnpj);
  if (existing) {
    db.prepare(
      `UPDATE companies SET name = ?, password_hash = ?, phone = ?, city = ?, tax_regime = ? WHERE id = ?`
    ).run(name, hash, phone || null, city || null, taxRegime || null, existing.id);
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO companies (name, cnpj, password_hash, phone, city, tax_regime) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, cleanCnpj, hash, phone || null, city || null, taxRegime || null);
  console.log(`Empresa cadastrada: ${name} (${cleanCnpj})`);
  return info.lastInsertRowid;
}

function ensureAdmin(companyId, email, password) {
  if (!companyId || !email || !password) return;
  const existing = db.prepare('SELECT id FROM employees WHERE company_id = ? AND email = ?').get(companyId, email);
  if (existing) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO employees (company_id, name, cpf, email, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')`
  ).run(companyId, 'Administrador (DP)', '00000000000', email, hash);
  console.log(`Usuário do DP criado: ${email}`);
}

// Empresas configuradas via variáveis de ambiente. COMPANY_1_* é a primeira empresa;
// adicione COMPANY_2_*, COMPANY_3_*... para outros clientes usarem o mesmo sistema.
function seedCompaniesFromEnv() {
  let index = 1;
  while (process.env[`COMPANY_${index}_CNPJ`]) {
    const prefix = `COMPANY_${index}_`;
    const companyId = upsertCompany({
      name: process.env[`${prefix}NAME`],
      cnpj: process.env[`${prefix}CNPJ`],
      password: process.env[`${prefix}PASSWORD`],
      phone: process.env[`${prefix}PHONE`],
      city: process.env[`${prefix}CITY`],
      taxRegime: process.env[`${prefix}TAX_REGIME`],
    });
    if (companyId && process.env[`${prefix}ADMIN_EMAIL`]) {
      ensureAdmin(companyId, process.env[`${prefix}ADMIN_EMAIL`], process.env[`${prefix}ADMIN_PASSWORD`]);
    }
    index += 1;
  }
}

seedCompaniesFromEnv();

module.exports = db;
