const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function calcWorkedMinutes(punchesOfDay) {
  const byType = Object.fromEntries(punchesOfDay.map((p) => [p.type, new Date(p.timestamp)]));
  const { entrada, saida_almoco, volta_almoco, saida } = byType;
  if (!entrada || !saida) return null;
  let minutes = (saida - entrada) / 60000;
  if (saida_almoco && volta_almoco) {
    minutes -= (volta_almoco - saida_almoco) / 60000;
  }
  return Math.round(minutes);
}

function buildReportRows({ from, to, employeeId }) {
  let query = `
    SELECT p.id, p.employee_id, e.name, e.cpf, p.type, p.timestamp
    FROM punches p JOIN employees e ON e.id = p.employee_id
    WHERE 1=1`;
  const params = [];
  if (from) {
    query += ' AND date(p.timestamp) >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND date(p.timestamp) <= ?';
    params.push(to);
  }
  if (employeeId) {
    query += ' AND p.employee_id = ?';
    params.push(employeeId);
  }
  query += ' ORDER BY e.name, p.timestamp';
  const rows = db.prepare(query).all(...params);

  // Agrupar por colaborador + dia
  const grouped = new Map();
  for (const r of rows) {
    const day = r.timestamp.slice(0, 10);
    const key = `${r.employee_id}_${day}`;
    if (!grouped.has(key)) {
      grouped.set(key, { name: r.name, cpf: r.cpf, day, punches: [] });
    }
    grouped.get(key).punches.push(r);
  }

  return Array.from(grouped.values()).map((g) => {
    const byType = {};
    for (const p of g.punches) byType[p.type] = p.timestamp.slice(11, 16);
    const workedMinutes = calcWorkedMinutes(g.punches);
    return {
      colaborador: g.name,
      cpf: g.cpf,
      data: g.day,
      entrada: byType.entrada || '',
      saida_almoco: byType.saida_almoco || '',
      volta_almoco: byType.volta_almoco || '',
      saida: byType.saida || '',
      horas_trabalhadas:
        workedMinutes !== null
          ? `${String(Math.floor(workedMinutes / 60)).padStart(2, '0')}:${String(workedMinutes % 60).padStart(2, '0')}`
          : '',
    };
  });
}

// Relatório em JSON (para tela do DP)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { from, to, employeeId } = req.query;
  res.json(buildReportRows({ from, to, employeeId }));
});

// Relatório em CSV (para fechamento de folha)
router.get('/csv', requireAuth, requireAdmin, (req, res) => {
  const { from, to, employeeId } = req.query;
  const rows = buildReportRows({ from, to, employeeId });

  const header = 'Colaborador;CPF;Data;Entrada;Saida Almoco;Volta Almoco;Saida;Horas Trabalhadas';
  const lines = rows.map((r) =>
    [r.colaborador, r.cpf, r.data, r.entrada, r.saida_almoco, r.volta_almoco, r.saida, r.horas_trabalhadas].join(';')
  );
  const csv = '﻿' + [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ponto_${from || 'inicio'}_a_${to || 'hoje'}.csv"`);
  res.send(csv);
});

module.exports = router;
