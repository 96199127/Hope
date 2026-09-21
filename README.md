# Hope — Marcador de Ponto

Sistema próprio de marcação de ponto dos colaboradores da Hope Consultoria, pensado como alternativa simples ao Secullum PontoWeb. Funciona pelo **celular** e pelo **navegador (PC)**, exige **foto no momento da batida** e gera **relatórios para o DP** fechar a folha.

## Estrutura

- `backend/` — API (Node + Express + SQLite), autenticação, upload de fotos e relatórios (JSON/CSV).
- `frontend/` — Aplicação web responsiva (PWA), sem build step, com captura de câmera para a foto do ponto.

## Funcionalidades

- Login por CPF e senha.
- Colaborador bate o ponto (entrada, saída para almoço, volta do almoço, saída) e é obrigado a tirar uma foto na hora — a foto fica associada ao registro.
- Geolocalização opcional registrada junto da batida (se o navegador permitir).
- Painel do DP: cadastro/ativação de colaboradores, relatório por período/colaborador com total de horas trabalhadas, exportação em **CSV** para fechamento de folha.
- Fotos das batidas ficam acessíveis apenas para o DP/administrador (auditoria).

## Rodando localmente

```bash
cd backend
cp .env.example .env   # ajuste JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run dev             # http://localhost:3001

cd ../frontend
npm install
npm start                # http://localhost:3000
```

No primeiro acesso, use o `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env` — o CPF do admin inicial é `00000000000`. Recomenda-se trocar isso criando um colaborador admin de verdade e desativando o admin padrão.

## Deploy no servidor Oraclon (junto do Chatwoot)

O `docker-compose.yml` na raiz sobe backend (porta 3001) e frontend (porta 3000) com `restart: unless-stopped`, para rodar 24h sem perder dados (SQLite fica em volume Docker) nem conexão.

```bash
cp backend/.env.example backend/.env   # configure antes de subir
docker compose up -d --build
```

Aponte um proxy reverso (o mesmo Traefik/nginx que já expõe o Chatwoot) para:
- `/` → frontend (porta 3000)
- `/api` → backend (porta 3001)

com HTTPS, para que a câmera do celular funcione (navegadores exigem HTTPS para `getUserMedia` fora de `localhost`).

## Próximos passos sugeridos

- Backup automático do volume `ponto_data` (SQLite) e `ponto_uploads` (fotos).
- Exportação em Excel além do CSV, se o DP preferir.
- Regras de banco de horas / horas extras específicas da folha da Hope.
