# Alertas de "cliente sem resposta"

Duas camadas complementares — use as duas juntas.

## Camada 1 — SLA nativo do Chatwoot (visual, tempo real)

1. No Chatwoot, vá em **Configurações > Políticas de SLA > Adicionar política**
2. Configure, por exemplo:
   - **Tempo de primeira resposta**: 2 horas
   - **Tempo de resolução**: 24 horas
   - **Horário comercial**: defina os horários de atendimento da Hope Consultoria
     em **Configurações > Horário Comercial**, para o SLA não contar madrugada/fim de
     semana como atraso
3. Aplique a política à caixa de entrada do WhatsApp
4. Ative em **Configurações > Notificações** os alertas de "SLA prestes a vencer" e
   "SLA violado" — aparecem como notificação dentro do Chatwoot e por e-mail para o
   agente responsável

Isso cobre o "não deixar ninguém sem resposta" em tempo real, com indicador visual
na fila (ícone vermelho/laranja na conversa).

## Camada 2 — Script de verificação e alerta externo (WhatsApp/Slack/e-mail)

O SLA nativo avisa só quem está logado no Chatwoot. O script
`scripts/check_unanswered.py` complementa isso enviando um resumo para fora do
sistema — útil para a gestão acompanhar sem precisar abrir o Chatwoot.

### Configuração

1. Instale o Python 3.10+ (se ainda não tiver) e as dependências:
   ```powershell
   cd C:\whatsapp-monitor\scripts
   pip install -r requirements.txt
   ```
2. No `.env` (raiz do projeto), preencha:
   - `CHATWOOT_API_ACCESS_TOKEN`: token do agente (passo 5 do guia de instalação)
   - `CHATWOOT_ACCOUNT_ID`: normalmente `1` na primeira conta criada
   - `SLA_HOURS_LIMIT`: quantas horas sem resposta disparam o alerta
   - `ALERT_WEBHOOK_URL`: URL de um **Slack Incoming Webhook** ou **Teams
     Incoming Webhook** (opcional)
   - `ALERT_EMAIL_TO` / `SMTP_*`: para receber por e-mail em vez de/além do webhook
     (opcional)
3. Teste manualmente:
   ```powershell
   python check_unanswered.py
   ```
   Deve imprimir a lista de conversas sem resposta e (se configurado) disparar o
   alerta.

### Agendar execução automática (Windows Task Scheduler)

1. Abra o **Agendador de Tarefas** do Windows
2. **Criar Tarefa Básica** → nome: "Monitor WhatsApp Hope"
3. Disparador: **Diariamente**, repetir a cada **30 minutos**, indefinidamente
4. Ação: **Iniciar um programa**
   - Programa/script: `python.exe` (ou o caminho completo, ex:
     `C:\Python312\python.exe`)
   - Argumentos: `C:\whatsapp-monitor\scripts\check_unanswered.py`
   - Iniciar em: `C:\whatsapp-monitor\scripts`
5. Salve. A partir daí, a cada 30 minutos o script roda em segundo plano e avisa
   automaticamente se algum cliente está sem resposta.

### Relatório consolidado para gestão

O mesmo script pode virar a base de um relatório diário: basta trocar o `print`
final por uma gravação em CSV/planilha, ou usar a API de relatórios do Chatwoot
(`/api/v1/accounts/{id}/reports/conversations`) para números agregados por período
(volume de mensagens, tempo médio de primeira resposta, etc.). Posso montar essa
parte também — é só pedir.
