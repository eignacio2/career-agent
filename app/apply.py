"""Decide how an application leaves the machine.

Email postings can be sent (or written to the outbox). Greenhouse / Lever /
Workday / Easy Apply forms are never filled in by this agent — scripted
submission violates most boards' terms of service. Those get a prepared pack
and a URL.
"""

from __future__ import annotations

from app.mail import MailAttachment, MailMessage, SendResult, send_mail
from app.models import Job, Profile, TailoredApplication
from app.resume_render import escape_html


def channel_for(job: Job) -> str:
    return "email" if job.apply_email else "external_form"


def _subject(job: Job, profile: Profile) -> str:
    return f"Application: {job.title} — {profile.full_name}"


def _text(job: Job, profile: Profile, tailored: TailoredApplication) -> str:
    return "\n".join(
        [
            tailored.cover_letter,
            "",
            "—" * 20,
            "",
            f"Resume — {profile.full_name}",
            "",
            tailored.resume_markdown,
            "",
            f"Posting reference: {job.url}",
        ]
    )


def _html(job: Job, profile: Profile, tailored: TailoredApplication) -> str:
    letter = "".join(
        f'<p style="margin:0 0 14px">{escape_html(paragraph).replace(chr(10), "<br />")}</p>'
        for paragraph in tailored.cover_letter.split("\n\n")
    )
    return f"""<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;max-width:640px">
{letter}
<p style="font-size:13px;color:#6b7280">Posting: <a href="{escape_html(job.url)}">{escape_html(job.url)}</a></p>
</div>"""


def submit_by_email(job: Job, profile: Profile, tailored: TailoredApplication) -> tuple[bool, SendResult | None, str]:
    if not job.apply_email:
        return (
            False,
            None,
            "This posting has no application address; submit through the company's own form.",
        )

    slug = f"{profile.full_name}-{job.company}".replace(" ", "-").lower()
    result = send_mail(
        MailMessage(
            to=job.apply_email,
            subject=_subject(job, profile),
            text=_text(job, profile, tailored),
            html=_html(job, profile, tailored),
            attachments=[
                MailAttachment(
                    filename=f"{slug}-resume.md",
                    content=tailored.resume_markdown,
                    content_type="text/markdown",
                )
            ],
        )
    )
    if result.transport == "smtp" and result.ok:
        return True, result, f"Emailed to {job.apply_email}. {result.detail}"
    return (
        False,
        result,
        (
            f"Application drafted but not delivered: {result.detail}"
            if result.ok
            else f"Application could not be delivered: {result.error or result.detail}"
        ),
    )
