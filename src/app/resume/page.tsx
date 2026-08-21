import { PageHeader } from "@/components/app-shell";
import { ResumeEditor } from "@/components/resume-editor";
import { getResume } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function ResumePage() {
  const resume = getResume();

  return (
    <div className="pb-16">
      <PageHeader
        title="Master resume"
        description="This is the source of truth the agent tailors from. It never edits this copy — each application gets its own version with bullets reordered and trimmed for that posting."
      />
      <div className="px-5 py-6 sm:px-8">
        <ResumeEditor initial={resume} />
      </div>
    </div>
  );
}
