# Guia de Instalação — Monitoramento de WhatsApp (Hope Consultoria)

Stack: **WAHA** (conecta ao WhatsApp via QR Code, sem custo de API) + **Chatwoot**
(caixa de entrada compartilhada com fila, SLA e relatórios).

## 1. Pré-requisitos

- Windows 10/11 com virtualização habilitada na BIOS
- [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado e aberto
- Um número de WhatsApp dedicado ao atendimento (recomendado não usar o pessoal)

## 2. Preparar a pasta do projeto

```powershell
mkdir C:\whatsapp-monitor
cd C:\whatsapp-monitor
```

Copie para essa pasta os arquivos deste diretório (`docker-compose.yml`, `.env.example`,
a pasta `scripts/`).

## 3. Configurar variáveis de ambiente

```powershell
copy .env.example .env
notepad .env
```

Preencha:
- `POSTGRES_PASSWORD` e `REDIS_PASSWORD`: qualquer senha forte
- `CHATWOOT_SECRET_KEY_BASE`: gere com `docker run --rm ruby:3.2 ruby -rsecurerandom -e "puts SecureRandom.hex(64)"`
  (ou peça para eu gerar uma e colar aqui)
- `WAHA_API_KEY`: qualquer chave forte, você vai usá-la depois para autenticar no WAHA

## 4. Subir os containers

```powershell
docker compose up -d
```

Aguarde de 3 a 5 minutos na primeira vez (download das imagens + migração do banco).
Acompanhe com:

```powershell
docker compose logs -f chatwoot
```

Quando aparecer `Listening on http://0.0.0.0:3000`, está pronto.

## 5. Criar a conta no Chatwoot

1. Acesse `http://localhost:3001`
2. Crie a conta de administrador (nome, e-mail, senha)
3. Em **Configurações > Caixas de entrada > Adicionar caixa de entrada**, escolha
   **API** como canal (o WAHA vai se conectar via webhook)
4. Gere um **token de acesso de agente** em `Perfil > Configurações de Acesso à API` —
   você vai precisar dele no `.env` para os alertas de SLA (`CHATWOOT_API_ACCESS_TOKEN`)

## 6. Conectar o WhatsApp (QR Code) no WAHA

1. Acesse `http://localhost:3000` (usuário: qualquer, senha: valor de `WAHA_API_KEY`)
2. Inicie uma sessão (`POST /api/sessions/start` com `{"name": "default"}`) ou use a
   tela de administração do WAHA, se disponível na versão instalada
3. Escaneie o QR Code exibido usando o WhatsApp do celular do atendimento
   (Configurações > Aparelhos conectados > Conectar um aparelho)
4. Confirme no Chatwoot que novas mensagens do WhatsApp aparecem na caixa de entrada

## 7. Configurar alertas de "sem resposta"

Veja o arquivo [`ALERTAS-SLA.md`](./ALERTAS-SLA.md) — cobre tanto as regras nativas de
SLA do Chatwoot quanto o script `scripts/check_unanswered.py`, que pode ser agendado
para rodar a cada 30 minutos e avisar no Slack/Teams/e-mail.

---

## Troubleshooting comum

**`docker compose up -d` trava ou dá erro "Cannot connect to the Docker daemon"**
→ O Docker Desktop não está aberto. Abra o aplicativo e espere o ícone da baleia
ficar estável na bandeja do sistema antes de rodar o comando de novo.

**Porta 3000 ou 3001 já em uso**
→ Outro programa está usando a porta (ex: outro serviço local). Altere o mapeamento
no `docker-compose.yml`, por exemplo `"3002:3000"`, e acesse pela nova porta.

**Chatwoot fica em loop reiniciando (`docker compose logs chatwoot` mostra erro de banco)**
→ Normalmente é a primeira migração que ainda não terminou. Espere mais alguns
minutos. Se persistir, rode `docker compose restart chatwoot`.

**QR Code do WAHA expira antes de escanear**
→ Gere um novo QR chamando o endpoint de start da sessão de novo; o código expira
em ~60 segundos por padrão do WhatsApp Web.

**Depois de reiniciar o PC, tudo para de funcionar**
→ Os containers não sobem sozinhos com o Windows por padrão. Marque
"Start Docker Desktop when you log in" nas configurações do Docker Desktop, e os
containers com `restart: always` (já configurado no `docker-compose.yml`) voltam
automaticamente assim que o Docker iniciar.

**Perdi a sessão do WhatsApp (aparelho desconectado)**
→ Acontece se o celular ficar 14 dias sem internet ou a sessão for encerrada no
celular. Basta gerar um novo QR Code e escanear de novo — as conversas antigas
permanecem no Chatwoot.

**Quero migrar de PC/servidor**
→ Os volumes Docker (`postgres_data`, `waha_sessions`, etc.) guardam todo o estado.
Faça backup com `docker run --rm -v whatsapp-monitor_postgres_data:/data -v ${PWD}:/backup alpine tar czf /backup/postgres_backup.tar.gz /data` antes de desligar o
PC antigo, e restaure no novo antes de subir os containers.
