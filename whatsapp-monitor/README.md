# Monitoramento de WhatsApp — Hope Consultoria

Solução gratuita e auto-hospedada para não deixar clientes sem resposta no
WhatsApp: **WAHA** (conector WhatsApp Web via QR Code) + **Chatwoot** (fila de
atendimento, SLA e relatórios).

## Conteúdo deste diretório

| Arquivo | Para quê |
|---|---|
| `docker-compose.yml` | Sobe WAHA + Chatwoot + Postgres + Redis |
| `.env.example` | Modelo de variáveis de ambiente (copie para `.env`) |
| `docs/GUIA-INSTALACAO.md` | Passo a passo completo + troubleshooting |
| `docs/ALERTAS-SLA.md` | Como configurar SLA no Chatwoot + alertas externos |
| `scripts/check_unanswered.py` | Verifica conversas sem resposta e alerta (webhook/e-mail) |

## Início rápido

```powershell
mkdir C:\whatsapp-monitor
cd C:\whatsapp-monitor
# copie os arquivos deste diretório para cá
copy .env.example .env
notepad .env          # preencha as senhas/chaves
docker compose up -d
```

Depois acesse `http://localhost:3001` (Chatwoot) e `http://localhost:3000` (WAHA).
Detalhes completos em [`docs/GUIA-INSTALACAO.md`](./docs/GUIA-INSTALACAO.md).

> Esta instalação roda localmente no computador/servidor da Hope Consultoria —
> não em nuvem. Os passos que envolvem abrir o Docker Desktop, rodar comandos no
> PowerShell e escanear o QR Code do WhatsApp precisam ser feitos na própria
> máquina, pois exigem acesso físico (Docker local e o celular do atendimento).
