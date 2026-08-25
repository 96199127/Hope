#!/usr/bin/env python3
"""
check_unanswered.py - Monitoramento de conversas do WhatsApp sem resposta (Hope Consultoria)

O que faz:
  1. Consulta a API do Chatwoot pedindo as conversas abertas ("open").
  2. Para cada uma, verifica se a última mensagem foi do cliente (incoming) e
     há quanto tempo está sem resposta de um agente.
  3. Se ultrapassar SLA_HOURS_LIMIT horas, envia um alerta (webhook e/ou e-mail).
  4. Imprime um resumo no console - útil para rodar manualmente ou ver o log
     quando agendado no Task Scheduler do Windows / cron do Linux.

Como agendar (Windows Task Scheduler):
  - Ação: python.exe
  - Argumentos: C:\\whatsapp-monitor\\scripts\\check_unanswered.py
  - Disparo: a cada 30 minutos, indefinidamente

Requisitos:
  pip install requests python-dotenv
"""

import os
import sys
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

CHATWOOT_BASE_URL = os.environ.get("CHATWOOT_BASE_URL", "http://localhost:3001").rstrip("/")
CHATWOOT_API_ACCESS_TOKEN = os.environ.get("CHATWOOT_API_ACCESS_TOKEN", "")
CHATWOOT_ACCOUNT_ID = os.environ.get("CHATWOOT_ACCOUNT_ID", "1")
SLA_HOURS_LIMIT = float(os.environ.get("SLA_HOURS_LIMIT", "2"))
ALERT_WEBHOOK_URL = os.environ.get("ALERT_WEBHOOK_URL", "")

ALERT_EMAIL_TO = os.environ.get("ALERT_EMAIL_TO", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")


def fetch_open_conversations():
    url = f"{CHATWOOT_BASE_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations"
    headers = {"api_access_token": CHATWOOT_API_ACCESS_TOKEN}
    params = {"status": "open"}
    resp = requests.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json().get("data", {}).get("payload", [])


def hours_since(unix_timestamp):
    last = datetime.fromtimestamp(unix_timestamp, tz=timezone.utc)
    return (datetime.now(tz=timezone.utc) - last).total_seconds() / 3600


def find_unanswered(conversations):
    """Conversas cuja última mensagem é do cliente e já passou do limite de SLA."""
    pending = []
    for conv in conversations:
        last_message = conv.get("last_non_activity_message") or conv.get("messages", [{}])[-1]
        if not last_message:
            continue
        # message_type == 0 -> incoming (cliente); 1 -> outgoing (agente)
        if last_message.get("message_type") != 0:
            continue

        created_at = last_message.get("created_at")
        if not created_at:
            continue

        elapsed = hours_since(created_at)
        if elapsed >= SLA_HOURS_LIMIT:
            pending.append(
                {
                    "id": conv.get("id"),
                    "contact": (conv.get("meta", {}).get("sender", {}) or {}).get("name", "desconhecido"),
                    "elapsed_hours": round(elapsed, 1),
                    "link": f"{CHATWOOT_BASE_URL}/app/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conv.get('id')}",
                }
            )
    return sorted(pending, key=lambda c: c["elapsed_hours"], reverse=True)


def send_webhook_alert(pending):
    if not ALERT_WEBHOOK_URL:
        return
    lines = [f"⚠️ *{len(pending)} cliente(s) sem resposta no WhatsApp*"]
    for c in pending:
        lines.append(f"- {c['contact']} — {c['elapsed_hours']}h sem resposta — {c['link']}")
    payload = {"text": "\n".join(lines)}
    try:
        requests.post(ALERT_WEBHOOK_URL, json=payload, timeout=10)
    except requests.RequestException as exc:
        print(f"[erro] falha ao enviar webhook: {exc}", file=sys.stderr)


def send_email_alert(pending):
    if not (ALERT_EMAIL_TO and SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        return
    import smtplib
    from email.mime.text import MIMEText

    body_lines = [f"{len(pending)} cliente(s) sem resposta no WhatsApp:\n"]
    for c in pending:
        body_lines.append(f"- {c['contact']} — {c['elapsed_hours']}h sem resposta — {c['link']}")

    msg = MIMEText("\n".join(body_lines))
    msg["Subject"] = f"[Hope Consultoria] {len(pending)} cliente(s) sem resposta no WhatsApp"
    msg["From"] = SMTP_USER
    msg["To"] = ALERT_EMAIL_TO

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [ALERT_EMAIL_TO], msg.as_string())
    except Exception as exc:  # noqa: BLE001 - relatar qualquer falha de envio
        print(f"[erro] falha ao enviar e-mail: {exc}", file=sys.stderr)


def main():
    if not CHATWOOT_API_ACCESS_TOKEN:
        print("[erro] defina CHATWOOT_API_ACCESS_TOKEN no .env (Perfil > Configurações de acesso à API no Chatwoot)", file=sys.stderr)
        sys.exit(1)

    conversations = fetch_open_conversations()
    pending = find_unanswered(conversations)

    print(f"Verificação em {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Conversas abertas: {len(conversations)} | Sem resposta há mais de {SLA_HOURS_LIMIT}h: {len(pending)}")
    for c in pending:
        print(f"  - {c['contact']}: {c['elapsed_hours']}h ({c['link']})")

    if pending:
        send_webhook_alert(pending)
        send_email_alert(pending)


if __name__ == "__main__":
    main()
