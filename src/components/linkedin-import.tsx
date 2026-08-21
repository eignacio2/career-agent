"use client";

import { AlertTriangle, Check, FileUp, Loader2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Snapshot {
  profileUrl: string;
  name: string;
  headline: string;
  about: string;
  openToWork: string;
  skills: string[];
  hasExperienceSection: boolean;
  hasCertificationsSection: boolean;
}

export function LinkedInImport({ hasSnapshot }: { hasSnapshot: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ snapshot: Snapshot; warnings: string[] } | null>(null);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(body: FormData) {
    setBusy(true);
    try {
      const response = await fetch("/api/linkedin/import", { method: "POST", body });
      const payload = (await response.json()) as { error?: string; snapshot: Snapshot; warnings: string[] };
      if (!response.ok) {
        toast.error("Could not read that profile", { description: payload.error });
        return;
      }
      setResult({ snapshot: payload.snapshot, warnings: payload.warnings ?? [] });
      toast.success("LinkedIn profile captured", {
        description: "Regenerate the pack to see exactly what to change.",
      });
    } catch (error) {
      toast.error("Could not read that profile", {
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
    void send(body);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && result) window.location.reload();
        if (!next) setPasted("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileUp className="size-4" />
          {hasSnapshot ? "Update my profile snapshot" : "Upload my LinkedIn"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload your current LinkedIn profile</DialogTitle>
          <DialogDescription>
            On your profile, open the <strong>More</strong> menu and choose <strong>Save to PDF</strong>, or print the
            page to PDF from your browser. Either works. The agent reads what your profile says today so it can tell
            you which specific fields to change.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <Tabs defaultValue="file">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="file">Upload PDF</TabsTrigger>
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
                    <p className="text-sm font-medium">Reading your profile…</p>
                  </div>
                ) : (
                  <>
                    <FileUp className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Drop your LinkedIn PDF here</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Printed LinkedIn pages carry a lot of navigation clutter. The importer strips it and keeps your
                      headline, About section, skills, and sections.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                      Choose a file
                    </Button>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf"
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
                placeholder="Select your whole LinkedIn profile page, copy, and paste it here."
              />
              <Button
                disabled={busy || pasted.trim().length < 80}
                onClick={() => {
                  const body = new FormData();
                  body.append("text", pasted);
                  void send(body);
                }}
                className="gap-2"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Read this profile
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium">Captured your profile</span>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                {[
                  { label: "Name", value: result.snapshot.name },
                  { label: "Headline", value: result.snapshot.headline },
                  { label: "Open to", value: result.snapshot.openToWork },
                  { label: "Top skills", value: result.snapshot.skills.slice(0, 5).join(", ") },
                  {
                    label: "Experience",
                    value: result.snapshot.hasExperienceSection ? "Present" : "Missing entirely",
                  },
                  {
                    label: "Certifications",
                    value: result.snapshot.hasCertificationsSection ? "Present" : "Missing",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-muted-foreground">{row.label}</dt>
                    <dd className={cn("min-w-0", row.value ? "text-foreground" : "italic text-muted-foreground")}>
                      {row.value || "not found"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {result.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />
                  <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200">Worth knowing</h3>
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
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button
              onClick={() => {
                setOpen(false);
                window.location.reload();
              }}
            >
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
