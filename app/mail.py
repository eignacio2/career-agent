"""Outbound mail: SMTP when configured, otherwise a local outbox.

The agent is still runnable without credentials. Interview talking point:
the same `send_mail()` writes either a Gmail message or a file under
`.data/outbox/`. Transport is a config concern, not a pipeline concern.
"""

from __future__ import annotations

import os
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from pathlib import Path

from app import config


@dataclass
class MailAttachment:
    filename: str
    content: str
    content_type: str = "text/plain"


@dataclass
class MailMessage:
    to: str
    subject: str
    text: str
    html: str = ""
    attachments: list[MailAttachment] = field(default_factory=list)


@dataclass
class SendResult:
    ok: bool
    transport: str
    detail: str
    error: str | None = None


def smtp_config() -> dict | None:
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        return None
    port = int(os.environ.get("SMTP_PORT", "587"))
    return {
        "host": host,
        "port": port,
        "secure": os.environ.get("SMTP_SECURE", "").lower() == "true" or port == 465,
        "user": os.environ.get("SMTP_USER", "").strip() or None,
        "pass": os.environ.get("SMTP_PASS", "").strip() or None,
        "from": os.environ.get("MAIL_FROM", "").strip()
        or os.environ.get("SMTP_USER", "").strip()
        or f"career-agent@{host}",
    }


def is_smtp_configured() -> bool:
    return smtp_config() is not None


def _slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    return cleaned.strip("-")[:60] or "message"


def write_outbox(message: MailMessage) -> SendResult:
    outbox = Path(config.DATA_DIR) / "outbox"
    outbox.mkdir(parents=True, exist_ok=True)
    from app.models import now_iso

    stamp = now_iso().replace(":", "-")
    base = f"{stamp}__{_slug(message.subject)}"
    (outbox / f"{base}.txt").write_text(
        f"To: {message.to}\nSubject: {message.subject}\n\n{message.text}",
        encoding="utf-8",
    )
    if message.html:
        (outbox / f"{base}.html").write_text(message.html, encoding="utf-8")
    for attachment in message.attachments:
        (outbox / f"{base}__{attachment.filename}").write_text(attachment.content, encoding="utf-8")
    return SendResult(
        ok=True,
        transport="outbox",
        detail=f"SMTP is not configured, so the message was written to {outbox / (base + '.txt')}.",
    )


def send_mail(message: MailMessage) -> SendResult:
    cfg = smtp_config()
    if cfg is None:
        return write_outbox(message)

    email = EmailMessage()
    email["From"] = cfg["from"]
    email["To"] = message.to
    email["Subject"] = message.subject
    email.set_content(message.text)
    if message.html:
        email.add_alternative(message.html, subtype="html")
    for attachment in message.attachments:
        email.add_attachment(
            attachment.content.encode("utf-8"),
            maintype="text",
            subtype="markdown" if attachment.filename.endswith(".md") else "plain",
            filename=attachment.filename,
        )

    try:
        if cfg["secure"]:
            client = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=20)
        else:
            client = smtplib.SMTP(cfg["host"], cfg["port"], timeout=20)
            client.starttls()
        with client:
            if cfg["user"] and cfg["pass"]:
                client.login(cfg["user"], cfg["pass"])
            client.send_message(email)
        return SendResult(
            ok=True,
            transport="smtp",
            detail=f"Delivered via {cfg['host']}.",
        )
    except Exception as exc:
        fallback = write_outbox(message)
        return SendResult(
            ok=fallback.ok,
            transport="outbox",
            detail=f"SMTP failed; saved to outbox instead. {fallback.detail}",
            error=str(exc),
        )
