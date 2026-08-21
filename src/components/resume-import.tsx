"use client";

import { AlertTriangle, Check, FileUp, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, Resume } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ImportResult {
  source: string;
  engine: string;
  stats: {
    experienceEntries: number;
    bullets: number;
    skills: number;
    educationEntries: number;
    charactersRead: number;
  };
  warnings: string[];
  resume: Resume;
  profileHints: Partial<Profile>;
}

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt,text/plain,application/pdf";

export function ResumeImport() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pasted, setPasted] = useState("");
  const [applyToProfile, setApplyToProfile] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(body: FormData) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/resume/import", { method: "POST", body });
      const payload = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) {
        toast.error("Could not read that file", { description: payload.error });
        return;
      }
      setResult(payload);
    } catch (error) {
      toast.error("Could not read that file", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    void upload(body);
  }

  function handlePaste() {
    if (pasted.trim().length < 80) {
      toast.error("That is not enough text to parse", {
        description: "Paste the full resume, including your work history.",
      });
      return;
    }
    const body = new FormData();
    body.append("text", pasted);
    void upload(body);
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    try {
      const response = await fetch("/api/resume/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          resume: result.resume,
          profileHints: result.profileHints,
          applyProfileHints: applyToProfile,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error("Could not save the import", { description: payload.error });
        return;
      }
      toast.success("Resume imported");
      // A full reload is the simplest way to reseed the editor's local state
      // with the newly saved resume.
      window.location.reload();
    } catch (error) {
      toast.error("Could not save the import", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const hints = result?.profileHints ?? {};
  const hintCount = Object.keys(hints).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setPasted("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileUp className="size-4" />
          Import my resume
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import your real history</DialogTitle>
          <DialogDescription>
            Upload a resume as PDF, Word, Markdown, or plain text. You can also export your LinkedIn profile to PDF
            (More → Save to PDF on your profile) and upload that. Nothing is saved until you review what was read.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <Tabs defaultValue="file">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="file">Upload a file</TabsTrigger>
              <TabsTrigger value="paste">Paste text</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFile(event.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                  dragging ? "border-primary bg-accent/40" : "border-border",
                )}
              >
                {busy ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    <p className="text-sm font-medium">Reading and structuring the document…</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Drop your resume here</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      PDF, DOCX, Markdown, or plain text, up to 12MB. Scanned or image-only PDFs have no readable
                      text — paste the content instead.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                      Choose a file
                    </Button>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? undefined)}
                />
              </div>
            </TabsContent>

            <TabsContent value="paste" className="mt-4 space-y-3">
              <Textarea
                rows={12}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder={"Paste your full resume text here, including headings like Experience, Skills, and Education."}
              />
              <Button onClick={handlePaste} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Parse this text
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium">Read {result.source}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Parsed with {result.engine} from {result.stats.charactersRead.toLocaleString()} characters of text.
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Roles", value: result.stats.experienceEntries },
                  { label: "Bullets", value: result.stats.bullets },
                  { label: "Skills", value: result.stats.skills },
                  { label: "Education", value: result.stats.educationEntries },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-muted/60 px-3 py-2">
                    <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
                    <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-medium">What it found</h3>
              <dl className="mt-3 space-y-1.5 text-xs">
                {[
                  { label: "Name", value: result.resume.basics.name },
                  { label: "Email", value: result.resume.basics.email },
                  { label: "Phone", value: result.resume.basics.phone },
                  { label: "Location", value: result.resume.basics.location },
                  { label: "LinkedIn", value: result.resume.basics.links.find((l) => l.label === "LinkedIn")?.url },
                  { label: "GitHub", value: result.resume.basics.links.find((l) => l.label === "GitHub")?.url },
                ].map((row) => (
                  <div key={row.label} className="flex gap-3">
                    <dt className="w-20 shrink-0 text-muted-foreground">{row.label}</dt>
                    <dd className={cn("min-w-0 break-all", row.value ? "text-foreground" : "text-muted-foreground italic")}>
                      {row.value || "not found"}
                    </dd>
                  </div>
                ))}
              </dl>

              {result.resume.experience.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t pt-3">
                  {result.resume.experience.slice(0, 6).map((role) => (
                    <li key={role.id} className="text-xs">
                      <span className="font-medium">{role.role || "Untitled role"}</span>
                      {role.company ? <span className="text-muted-foreground"> · {role.company}</span> : null}
                      <span className="text-muted-foreground">
                        {role.start || role.end ? ` · ${role.start}${role.end ? ` – ${role.end}` : ""}` : ""}
                        {` · ${role.bullets.length} bullet${role.bullets.length === 1 ? "" : "s"}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {result.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />
                  <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200">Check these before saving</h3>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hintCount > 0 ? (
              <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                <div>
                  <Label className="text-sm font-medium">Also update my search profile</Label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Copies {hintCount} field{hintCount === 1 ? "" : "s"} into Settings — name, contact details,
                    LinkedIn and GitHub URLs, and your skill list — so scoring uses them too.
                  </p>
                </div>
                <Switch
                  checked={applyToProfile}
                  onCheckedChange={setApplyToProfile}
                  aria-label="Apply to search profile"
                />
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {result ? (
            <>
              <Button variant="ghost" onClick={() => setResult(null)} disabled={busy}>
                Try a different file
              </Button>
              <Button onClick={confirm} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Replace my resume with this
              </Button>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Importing replaces the resume currently saved here. Your job matches and application history are not
              affected.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
