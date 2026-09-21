require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const punchRoutes = require('./routes/punches');
const reportRoutes = require('./routes/reports');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/punches', punchRoutes);
app.use('/api/reports', reportRoutes);

// Fotos das batidas: apenas admin/DP pode consultar
const uploadsPath = process.env.UPLOADS_PATH || './uploads';
app.use('/api/photos', requireAuth, requireAdmin, express.static(path.resolve(uploadsPath)));

// Serve o frontend junto com a API quando os dois estão no mesmo processo/host
// (útil para testes rápidos em um único serviço, ex.: Render). Em produção no
// Oraclon, backend e frontend continuam podendo rodar como containers separados.
const frontendPath = path.resolve(__dirname, '../../frontend/public');
const fs = require('fs');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
}

// Erros do multer / validações
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Erro inesperado' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Marcador de Ponto Hope rodando na porta ${port}`));
