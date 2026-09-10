"""HTTP surface: HTML for humans, JSON for the cron script."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from app import db
from app.config import CRON_SECRET
from app.models import Profile
from app.pipeline import RunInProgress, run_agent

ROOT = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(ROOT / "templates"))

app = FastAPI(title="Career Agent", version="0.2.0")
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")


class NoCacheHTML(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if "text/html" in response.headers.get("content-type", ""):
            response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(NoCacheHTML)


def _ctx(request: Request, **extra):
    profile = db.get_profile()
    counts = db.count_jobs()
    return {
        "request": request,
        "profile": profile,
        "counts": counts,
        "latest_run": db.latest_run(),
        **extra,
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "career-agent"}


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    jobs = db.list_jobs(limit=12)
    return templates.TemplateResponse("dashboard.html", _ctx(request, jobs=jobs))


@app.get("/jobs", response_class=HTMLResponse)
def jobs_page(request: Request, status: str | None = None):
    statuses = [status] if status in {"new", "shortlisted", "queued", "skipped"} else None
    jobs = db.list_jobs(status=statuses, limit=200)
    return templates.TemplateResponse(
        "jobs.html",
        _ctx(request, jobs=jobs, filter_status=status or "all"),
    )


@app.get("/jobs/{job_id}", response_class=HTMLResponse)
def job_detail(request: Request, job_id: int):
    job = db.get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return templates.TemplateResponse("job_detail.html", _ctx(request, job=job))


@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", _ctx(request))


@app.get("/concepts", response_class=HTMLResponse)
def concepts_page(request: Request):
    return templates.TemplateResponse("concepts.html", _ctx(request))


def _csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


@app.post("/settings")
def save_settings(
    full_name: Annotated[str, Form()],
    email: Annotated[str, Form()],
    phone: Annotated[str, Form()] = "",
    location: Annotated[str, Form()] = "",
    headline: Annotated[str, Form()] = "",
    summary: Annotated[str, Form()] = "",
    linkedin_url: Annotated[str, Form()] = "",
    github_url: Annotated[str, Form()] = "",
    experience_level: Annotated[str, Form()] = "new-grad",
    max_years_required: Annotated[str, Form()] = "2",
    include_internships: Annotated[str, Form()] = "off",
    skills: Annotated[str, Form()] = "",
    target_titles: Annotated[str, Form()] = "",
    target_locations: Annotated[str, Form()] = "",
    remote_preference: Annotated[str, Form()] = "any",
    min_salary: Annotated[str, Form()] = "",
    excluded_companies: Annotated[str, Form()] = "",
    excluded_keywords: Annotated[str, Form()] = "",
    auto_apply_threshold: Annotated[int, Form()] = 72,
):
    current = db.get_profile()
    years = None
    if max_years_required.strip():
        years = int(max_years_required)
    salary = int(min_salary) if min_salary.strip() else None
    if experience_level not in ("new-grad", "early-career", "mid", "senior"):
        experience_level = "new-grad"
    if remote_preference not in ("remote", "hybrid", "onsite", "any"):
        remote_preference = "any"

    updated = current.model_copy(
        update={
            "full_name": full_name.strip(),
            "email": email.strip(),
            "phone": phone.strip(),
            "location": location.strip(),
            "headline": headline.strip(),
            "summary": summary.strip(),
            "linkedin_url": linkedin_url.strip(),
            "github_url": github_url.strip(),
            "experience_level": experience_level,  # type: ignore[typeddict-item]
            "max_years_required": years,
            "include_internships": include_internships in {"on", "true", "1"},
            "skills": _csv(skills),
            "target_titles": _csv(target_titles),
            "target_locations": _csv(target_locations),
            "remote_preference": remote_preference,  # type: ignore[typeddict-item]
            "min_salary": salary,
            "excluded_companies": _csv(excluded_companies),
            "excluded_keywords": _csv(excluded_keywords),
            "auto_apply_threshold": auto_apply_threshold,
        }
    )
    db.save_profile(Profile.model_validate(updated.model_dump()))
    return RedirectResponse("/settings?saved=1", status_code=303)


@app.post("/runs")
def start_run(request: Request, offline: Annotated[str, Form()] = "off"):
    try:
        result = run_agent(
            trigger="web",
            offline=offline in {"on", "true", "1"},
        )
    except RunInProgress as exc:
        if "text/html" in request.headers.get("accept", ""):
            return templates.TemplateResponse(
                "dashboard.html",
                _ctx(request, jobs=db.list_jobs(limit=12), error=str(exc)),
                status_code=409,
            )
        raise HTTPException(409, str(exc)) from exc
    return RedirectResponse(f"/?ran={result['run_id']}", status_code=303)


def _authorize(request: Request) -> None:
    if not CRON_SECRET:
        return
    header = request.headers.get("authorization", "")
    token = ""
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        token = request.query_params.get("token", "")
    if token != CRON_SECRET:
        raise HTTPException(401, "Invalid cron token")


@app.post("/api/cron/daily")
def cron_daily(request: Request, offline: bool = False):
    _authorize(request)
    try:
        result = run_agent(trigger="cron", offline=offline)
    except RunInProgress as exc:
        raise HTTPException(409, str(exc)) from exc
    return JSONResponse(result)


@app.get("/api/jobs")
def api_jobs(status: str | None = None):
    statuses = [status] if status else None
    return [job.model_dump() for job in db.list_jobs(status=statuses, limit=200)]  # type: ignore[arg-type]


@app.get("/api/status")
def api_status():
    return {
        "counts": db.count_jobs(),
        "latest_run": db.latest_run().model_dump() if db.latest_run() else None,
        "profile": db.get_profile().model_dump(),
    }
