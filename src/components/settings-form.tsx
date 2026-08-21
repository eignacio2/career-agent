"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, RemotePreference } from "@/lib/types";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 mb-5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ListField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Textarea
        rows={rows}
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid preferred" },
  { value: "onsite", label: "On-site preferred" },
  { value: "any", label: "No preference" },
];

export function SettingsForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error("Could not save", { description: payload.error });
        return;
      }
      toast.success("Settings saved", { description: "The next run uses these values." });
      setDirty(false);
      router.refresh();
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {dirty ? "Save settings" : "Saved"}
        </Button>
        {dirty ? <span className="text-xs text-muted-foreground">You have unsaved changes.</span> : null}
      </div>

      <Tabs defaultValue="you">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="you">About you</TabsTrigger>
          <TabsTrigger value="targets">What to look for</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="you" className="mt-4 space-y-4">
          <Section
            title="Identity"
            description="Used on applications and in the cover letters the agent writes."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Full name" value={profile.fullName} onChange={(v) => set("fullName", v)} />
              <TextField label="Email" type="email" value={profile.email} onChange={(v) => set("email", v)} />
              <TextField label="Phone" value={profile.phone} onChange={(v) => set("phone", v)} />
              <TextField
                label="Location"
                value={profile.location}
                onChange={(v) => set("location", v)}
                placeholder="Austin, TX"
              />
            </div>
            <TextField
              label="Headline"
              hint="One line on what you do. Anchors both scoring and the LinkedIn pack."
              value={profile.headline}
              onChange={(v) => set("headline", v)}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Summary</Label>
              <Textarea
                rows={4}
                value={profile.summary}
                onChange={(event) => set("summary", event.target.value)}
                placeholder="Two or three sentences on the kind of work you want to be doing."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="LinkedIn URL" value={profile.linkedinUrl} onChange={(v) => set("linkedinUrl", v)} />
              <TextField label="GitHub URL" value={profile.githubUrl} onChange={(v) => set("githubUrl", v)} />
              <TextField
                label="Portfolio URL"
                value={profile.portfolioUrl}
                onChange={(v) => set("portfolioUrl", v)}
              />
            </div>
            <div className="max-w-40">
              <TextField
                label="Years of experience"
                type="number"
                value={String(profile.yearsExperience)}
                onChange={(v) => set("yearsExperience", Number(v) || 0)}
              />
            </div>
          </Section>

          <Section
            title="Skills"
            description="The scorer credits a posting's requirements only when they appear here or in your resume. Be honest — every one of these is fair game in an interview."
          >
            <ListField
              label="Skills — comma-separated"
              rows={5}
              value={profile.skills}
              onChange={(v) => set("skills", v)}
              placeholder="Python, SQL, PyTorch, RAG, Airflow"
            />
          </Section>
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-4">
          <Section
            title="Target roles"
            description="Each title is queried against the job boards separately, so more titles means broader coverage and more noise."
          >
            <ListField
              label="Job titles"
              rows={3}
              value={profile.targetTitles}
              onChange={(v) => set("targetTitles", v)}
              placeholder="Data Scientist, AI Engineer, Machine Learning Engineer"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Work arrangement</Label>
                <Select
                  value={profile.remotePreference}
                  onValueChange={(value) => set("remotePreference", value as RemotePreference)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMOTE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField
                label="Minimum salary (USD)"
                hint="Postings whose published range tops out below this lose the salary points entirely."
                type="number"
                value={profile.minSalary === null ? "" : String(profile.minSalary)}
                onChange={(v) => set("minSalary", v === "" ? null : Number(v) || 0)}
                placeholder="160000"
              />
            </div>
            <ListField
              label="Target locations"
              value={profile.targetLocations}
              onChange={(v) => set("targetLocations", v)}
              placeholder="Remote (US), Austin TX, New York NY"
            />
          </Section>

          <Section
            title="Filters"
            description="Hard rules applied before scoring. An excluded company or keyword drops a posting to zero regardless of how well it otherwise matches."
          >
            <ListField
              label="Companies to skip"
              value={profile.excludedCompanies}
              onChange={(v) => set("excludedCompanies", v)}
              placeholder="Current employer, a company you already interviewed with"
            />
            <ListField
              label="Required keywords"
              hint="A posting must contain all of these. Leave empty unless you have a genuine hard requirement."
              value={profile.requiredKeywords}
              onChange={(v) => set("requiredKeywords", v)}
              placeholder="visa sponsorship"
            />
            <ListField
              label="Excluded keywords"
              value={profile.excludedKeywords}
              onChange={(v) => set("excludedKeywords", v)}
              placeholder="unpaid, commission only, equity only"
            />
          </Section>
        </TabsContent>

        <TabsContent value="automation" className="mt-4 space-y-4">
          <Section
            title="Autopilot"
            description="With autopilot off, the agent prepares everything and waits for you. With it on, applications above your threshold are emailed automatically — but only to postings that publish an application address. Applications behind a company's own form always wait for you."
          >
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label className="text-sm font-medium">Send applications without asking</Label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {profile.autopilotEnabled
                    ? `Email applications scoring ${profile.autoApplyThreshold} or above go out on their own, up to ${profile.dailyApplicationCap} per day.`
                    : "Everything waits for your approval. Recommended until you have read a few tailored applications and trust the output."}
                </p>
              </div>
              <Switch
                checked={profile.autopilotEnabled}
                onCheckedChange={(checked) => set("autopilotEnabled", checked)}
                aria-label="Enable autopilot"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Match threshold (0–100)"
                hint="Below this, a posting is shortlisted or skipped instead of applied to. 78 is a reasonable starting point."
                type="number"
                value={String(profile.autoApplyThreshold)}
                onChange={(v) => set("autoApplyThreshold", Number(v) || 0)}
              />
              <TextField
                label="Daily application cap"
                hint="A hard ceiling on sends per day. Volume without tailoring is how applications get ignored."
                type="number"
                value={String(profile.dailyApplicationCap)}
                onChange={(v) => set("dailyApplicationCap", Number(v) || 0)}
              />
            </div>
          </Section>

          <Section
            title="Daily digest"
            description="After each run the agent emails a summary of what it sent, what is waiting on you, and what it screened out."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Send the digest to"
                type="email"
                value={profile.digestEmail}
                onChange={(v) => set("digestEmail", v)}
              />
              <TextField
                label="Scheduled hour (UTC, 0–23)"
                hint="Used by the cron entry in the README. The app does not run its own scheduler."
                type="number"
                value={String(profile.digestHourUtc)}
                onChange={(v) => set("digestHourUtc", Number(v) || 0)}
              />
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
