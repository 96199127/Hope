# Hope — Marcador de Ponto

Sistema próprio de marcação de ponto dos colaboradores da Hope Consultoria, pensado como alternativa simples ao Secullum PontoWeb. Funciona pelo **celular** e pelo **navegador (PC)**, identifica o colaborador por **reconhecimento facial** na hora de bater o ponto (foto obrigatória) e gera **relatórios para o DP** fechar a folha.

## Estrutura

- `backend/` — API (Node + Express + SQLite), autenticação, reconhecimento facial, upload de fotos e relatórios (JSON/CSV).
- `frontend/` — Aplicação web responsiva (PWA), sem build step, com câmera e reconhecimento facial no navegador (face-api.js).

## Como funciona (igual ao terminal do Secullum)

1. **Login único do terminal, por empresa**: cada empresa cliente tem seu próprio **CNPJ + senha**. Qualquer celular/tablet/PC usado para bater ponto entra com essas credenciais (não é um login por colaborador) e só enxerga os colaboradores daquela empresa.
2. Cada colaborador chega no aparelho, toca em **"Reconhecer meu rosto"** — o próprio navegador compara o rosto capturado com as fotos de cadastro e identifica quem é, sem precisar digitar nada.
3. O sistema confirma o nome e qual marcação é a vez (entrada, saída para almoço, volta do almoço ou saída), o colaborador confirma e a foto da batida fica registrada.
4. O **DP** tem um login separado (e-mail + senha) para cadastrar colaboradores (com a foto de referência), acompanhar batidas e gerar relatórios.

O reconhecimento facial roda **inteiramente no navegador** (biblioteca [face-api.js](https://github.com/justadudewhohacks/face-api.js), baseada em TensorFlow.js) — nenhuma foto é enviada para serviços externos de reconhecimento facial. O servidor recebe apenas o "vetor facial" (128 números que descrevem o rosto) para comparar com os colaboradores cadastrados, além da foto da batida em si (guardada para auditoria do DP).

## Funcionalidades

- Login do terminal por CNPJ (compartilhado) e login separado do DP por e-mail/senha.
- Reconhecimento facial automático do colaborador na hora de bater o ponto — sem senha individual, sem digitar nada.
- Foto obrigatória em toda batida, associada ao registro para conferência do DP.
- Geolocalização opcional registrada junto da batida (se o navegador permitir).
- Painel do DP: cadastro de colaboradores com a foto de referência (o próprio DP tira/anexa a foto e o sistema detecta o rosto na hora do cadastro), ativação/desativação, relatório por período/colaborador com total de horas trabalhadas, exportação em **CSV** para fechamento de folha.
- Fotos das batidas e de cadastro ficam acessíveis apenas para o DP/administrador (auditoria).

## Rodando localmente

```bash
cd backend
cp .env.example .env   # ajuste JWT_SECRET e os dados de cada empresa (COMPANY_1_*, COMPANY_2_*...)
npm install
npm run dev             # http://localhost:3001

cd ../frontend
npm install
npm start                # http://localhost:3000
```

- **Terminal de ponto**: entra com o CNPJ/senha da empresa (`COMPANY_1_CNPJ`/`COMPANY_1_PASSWORD` no `.env`). O `.env.example` já vem com a primeira empresa, **GRILL HAMBURGUERIA LTDA**, senha `Hope@12`.
- **DP**: entra com `COMPANY_1_ADMIN_EMAIL`/`COMPANY_1_ADMIN_PASSWORD` do `.env`, clicando em "Acesso do DP" na tela de login.
- Para atender **outra empresa cliente**, duplique o bloco no `.env` trocando o número (`COMPANY_2_NAME`, `COMPANY_2_CNPJ`, `COMPANY_2_PASSWORD`, `COMPANY_2_ADMIN_EMAIL`...) — cada empresa tem login, colaboradores e relatórios completamente isolados.
- Antes de qualquer colaborador conseguir bater ponto, o DP precisa cadastrá-lo com uma foto de rosto (tela "Novo colaborador" → anexar foto → "Detectar rosto na foto" → cadastrar).

## Deploy no servidor Oraclon (junto do Chatwoot)

O `docker-compose.yml` na raiz sobe backend (porta 3001) e frontend (porta 3000) com `restart: unless-stopped`, para rodar 24h sem perder dados (SQLite fica em volume Docker) nem conexão.

```bash
cp backend/.env.example backend/.env   # configure antes de subir
docker compose up -d --build
```

Aponte um proxy reverso (o mesmo Traefik/nginx que já expõe o Chatwoot) para:
- `/` → frontend (porta 3000)
- `/api` → backend (porta 3001)

com HTTPS, para que a câmera do celular funcione (navegadores exigem HTTPS para `getUserMedia` fora de `localhost`). O frontend carrega os modelos de reconhecimento facial de um CDN público (jsDelivr) — o servidor precisa de acesso à internet liberado para isso.

## Próximos passos sugeridos

- Backup automático do volume `ponto_data` (SQLite) e `ponto_uploads` (fotos).
- Exportação em Excel além do CSV, se o DP preferir.
- Regras de banco de horas / horas extras específicas da folha da Hope.
- Se quiser reduzir dependência de CDN externo, hospedar os pesos do face-api.js dentro do próprio `frontend/public/models`.
