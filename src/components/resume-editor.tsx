"use client";

import { Download, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { renderMiniMarkdown } from "@/lib/mini-markdown";
import { renderResumeMarkdown } from "@/lib/resume-render";
import type {
  Resume,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkillGroup,
} from "@/lib/types";

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}

function SectionCard({
  title,
  description,
  onRemove,
  children,
}: {
  title: string;
  description?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function ResumeEditor({ initial }: { initial: Resume }) {
  const [resume, setResume] = useState<Resume>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const markdown = useMemo(() => renderResumeMarkdown(resume), [resume]);
  const previewHtml = useMemo(() => renderMiniMarkdown(markdown), [markdown]);

  function update(mutate: (draft: Resume) => Resume) {
    setResume((current) => mutate(structuredClone(current)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error("Could not save the resume", { description: payload.error });
        return;
      }
      toast.success("Resume saved", {
        description: "The next run will tailor from this version.",
      });
      setDirty(false);
    } catch (error) {
      toast.error("Could not save the resume", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${resume.basics.name.replace(/\s+/g, "-").toLowerCase() || "resume"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving || !dirty} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {dirty ? "Save resume" : "Saved"}
          </Button>
          <Button variant="outline" onClick={download} className="gap-2">
            <Download className="size-4" />
            Download Markdown
          </Button>
          <CopyButton value={markdown} label="Copy Markdown" />
        </div>

        <Tabs defaultValue="basics">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="education">Education</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="mt-4 space-y-4">
            <SectionCard title="Contact and positioning" description="Appears at the top of every tailored resume.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={resume.basics.name}
                  onChange={(name) => update((draft) => ({ ...draft, basics: { ...draft.basics, name } }))}
                />
                <Field
                  label="Default title"
                  value={resume.basics.title}
                  onChange={(title) => update((draft) => ({ ...draft, basics: { ...draft.basics, title } }))}
                  placeholder="Data Scientist / AI Engineer"
                />
                <Field
                  label="Email"
                  type="email"
                  value={resume.basics.email}
                  onChange={(email) => update((draft) => ({ ...draft, basics: { ...draft.basics, email } }))}
                />
                <Field
                  label="Phone"
                  value={resume.basics.phone}
                  onChange={(phone) => update((draft) => ({ ...draft, basics: { ...draft.basics, phone } }))}
                />
              </div>
              <Field
                label="Location line"
                value={resume.basics.location}
                onChange={(location) => update((draft) => ({ ...draft, basics: { ...draft.basics, location } }))}
                placeholder="Austin, TX · Open to remote (US)"
              />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Summary</Label>
                <Textarea
                  rows={4}
                  value={resume.basics.summary}
                  onChange={(event) =>
                    update((draft) => ({ ...draft, basics: { ...draft.basics, summary: event.target.value } }))
                  }
                  placeholder="Two or three sentences on what you do and the scope you own."
                />
                <p className="text-[11px] text-muted-foreground">
                  Each application rewrites this line for the specific posting. This is the fallback.
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Links" description="Shown as a single line under your contact details.">
              {resume.basics.links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    className="w-32 shrink-0"
                    value={link.label}
                    placeholder="Label"
                    onChange={(event) =>
                      update((draft) => {
                        draft.basics.links[index].label = event.target.value;
                        return draft;
                      })
                    }
                  />
                  <Input
                    value={link.url}
                    placeholder="https://"
                    onChange={(event) =>
                      update((draft) => {
                        draft.basics.links[index].url = event.target.value;
                        return draft;
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove link"
                    onClick={() =>
                      update((draft) => {
                        draft.basics.links.splice(index, 1);
                        return draft;
                      })
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  update((draft) => {
                    draft.basics.links.push({ label: "", url: "" });
                    return draft;
                  })
                }
              >
                <Plus className="size-3.5" />
                Add link
              </Button>
            </SectionCard>

            <SectionCard title="Certifications" description="One per line.">
              <Textarea
                rows={3}
                value={resume.certifications.join("\n")}
                onChange={(event) =>
                  update((draft) => ({
                    ...draft,
                    certifications: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                  }))
                }
                placeholder="AWS Certified Machine Learning – Specialty"
              />
            </SectionCard>
          </TabsContent>

          <TabsContent value="skills" className="mt-4 space-y-4">
            {resume.skillGroups.map((group, index) => (
              <SectionCard
                key={group.id}
                title={group.label || "Untitled group"}
                description="Comma-separated. Each tailored resume promotes whichever of these the posting names."
                onRemove={() =>
                  update((draft) => ({
                    ...draft,
                    skillGroups: draft.skillGroups.filter((entry) => entry.id !== group.id),
                  }))
                }
              >
                <Field
                  label="Group label"
                  value={group.label}
                  onChange={(label) =>
                    update((draft) => {
                      draft.skillGroups[index].label = label;
                      return draft;
                    })
                  }
                  placeholder="ML & Modeling"
                />
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Skills</Label>
                  <Textarea
                    rows={3}
                    value={group.items.join(", ")}
                    onChange={(event) =>
                      update((draft) => {
                        draft.skillGroups[index].items = event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean);
                        return draft;
                      })
                    }
                  />
                </div>
              </SectionCard>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                update((draft) => {
                  const group: ResumeSkillGroup = { id: newId("sk"), label: "", items: [] };
                  draft.skillGroups.push(group);
                  return draft;
                })
              }
            >
              <Plus className="size-3.5" />
              Add skill group
            </Button>
          </TabsContent>

          <TabsContent value="experience" className="mt-4 space-y-4">
            {resume.experience.map((role, index) => (
              <SectionCard
                key={role.id}
                title={role.role || "New role"}
                description={role.company}
                onRemove={() =>
                  update((draft) => ({
                    ...draft,
                    experience: draft.experience.filter((entry) => entry.id !== role.id),
                  }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Role"
                    value={role.role}
                    onChange={(value) =>
                      update((draft) => {
                        draft.experience[index].role = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="Company"
                    value={role.company}
                    onChange={(value) =>
                      update((draft) => {
                        draft.experience[index].company = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="Location"
                    value={role.location}
                    onChange={(value) =>
                      update((draft) => {
                        draft.experience[index].location = value;
                        return draft;
                      })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Start (YYYY-MM)"
                      value={role.start}
                      onChange={(value) =>
                        update((draft) => {
                          draft.experience[index].start = value;
                          return draft;
                        })
                      }
                      placeholder="2023-02"
                    />
                    <Field
                      label="End"
                      value={role.end}
                      onChange={(value) =>
                        update((draft) => {
                          draft.experience[index].end = value;
                          return draft;
                        })
                      }
                      placeholder="Present"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Bullets — one per line</Label>
                  <Textarea
                    rows={6}
                    value={role.bullets.join("\n")}
                    onChange={(event) =>
                      update((draft) => {
                        draft.experience[index].bullets = event.target.value
                          .split("\n")
                          .map((line) => line.replace(/^[-•]\s*/, "").trim())
                          .filter(Boolean);
                        return draft;
                      })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Write more bullets than a resume can hold. The agent picks the four most relevant per posting, so
                    breadth here means better tailoring.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Stack — comma-separated</Label>
                  <Input
                    value={role.stack.join(", ")}
                    onChange={(event) =>
                      update((draft) => {
                        draft.experience[index].stack = event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean);
                        return draft;
                      })
                    }
                  />
                </div>
              </SectionCard>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                update((draft) => {
                  const role: ResumeExperience = {
                    id: newId("exp"),
                    company: "",
                    role: "",
                    location: "",
                    start: "",
                    end: "",
                    bullets: [],
                    stack: [],
                  };
                  draft.experience.unshift(role);
                  return draft;
                })
              }
            >
              <Plus className="size-3.5" />
              Add role
            </Button>
          </TabsContent>

          <TabsContent value="projects" className="mt-4 space-y-4">
            {resume.projects.map((project, index) => (
              <SectionCard
                key={project.id}
                title={project.name || "New project"}
                onRemove={() =>
                  update((draft) => ({
                    ...draft,
                    projects: draft.projects.filter((entry) => entry.id !== project.id),
                  }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Name"
                    value={project.name}
                    onChange={(value) =>
                      update((draft) => {
                        draft.projects[index].name = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="URL"
                    value={project.url}
                    onChange={(value) =>
                      update((draft) => {
                        draft.projects[index].url = value;
                        return draft;
                      })
                    }
                    placeholder="https://github.com/..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                  <Textarea
                    rows={3}
                    value={project.description}
                    onChange={(event) =>
                      update((draft) => {
                        draft.projects[index].description = event.target.value;
                        return draft;
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Stack — comma-separated</Label>
                  <Input
                    value={project.stack.join(", ")}
                    onChange={(event) =>
                      update((draft) => {
                        draft.projects[index].stack = event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean);
                        return draft;
                      })
                    }
                  />
                </div>
              </SectionCard>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                update((draft) => {
                  const project: ResumeProject = {
                    id: newId("prj"),
                    name: "",
                    url: "",
                    description: "",
                    stack: [],
                  };
                  draft.projects.push(project);
                  return draft;
                })
              }
            >
              <Plus className="size-3.5" />
              Add project
            </Button>
          </TabsContent>

          <TabsContent value="education" className="mt-4 space-y-4">
            {resume.education.map((entry, index) => (
              <SectionCard
                key={entry.id}
                title={entry.degree || "New entry"}
                description={entry.school}
                onRemove={() =>
                  update((draft) => ({
                    ...draft,
                    education: draft.education.filter((item) => item.id !== entry.id),
                  }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Degree"
                    value={entry.degree}
                    onChange={(value) =>
                      update((draft) => {
                        draft.education[index].degree = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="School"
                    value={entry.school}
                    onChange={(value) =>
                      update((draft) => {
                        draft.education[index].school = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="Start"
                    value={entry.start}
                    onChange={(value) =>
                      update((draft) => {
                        draft.education[index].start = value;
                        return draft;
                      })
                    }
                  />
                  <Field
                    label="End"
                    value={entry.end}
                    onChange={(value) =>
                      update((draft) => {
                        draft.education[index].end = value;
                        return draft;
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Detail (optional)</Label>
                  <Textarea
                    rows={2}
                    value={entry.detail}
                    onChange={(event) =>
                      update((draft) => {
                        draft.education[index].detail = event.target.value;
                        return draft;
                      })
                    }
                  />
                </div>
              </SectionCard>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                update((draft) => {
                  const entry: ResumeEducation = {
                    id: newId("edu"),
                    school: "",
                    degree: "",
                    start: "",
                    end: "",
                    detail: "",
                  };
                  draft.education.push(entry);
                  return draft;
                })
              }
            >
              <Plus className="size-3.5" />
              Add education
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">Live preview</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {dirty ? "Unsaved changes" : "Matches the saved version"}
              </p>
            </div>
          </div>
          <div
            className="max-h-[70vh] overflow-y-auto px-5 py-5"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </aside>
    </div>
  );
}
