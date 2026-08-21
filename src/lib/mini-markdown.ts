import { escapeHtml } from "./resume-render";

/**
 * Renders the small Markdown subset the resume generator emits (headings, bold,
 * italics, links, unordered lists). Avoids pulling in a full parser for output
 * this application produces itself.
 */
export function renderMiniMarkdown(markdown: string): string {
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const inline = (text: string): string =>
    escapeHtml(text)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
        const safe = /^(https?:|mailto:)/i.test(url) ? url : "#";
        return `<a href="${safe}" target="_blank" rel="noreferrer noopener" class="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="text-muted-foreground">$1</em>');

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const styles: Record<number, string> = {
        1: "text-xl font-semibold tracking-tight text-foreground mt-1 mb-1",
        2: "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mt-5 mb-2 pb-1 border-b",
        3: "text-sm font-semibold text-foreground mt-4 mb-1",
        4: "text-sm font-medium text-foreground mt-3 mb-1",
      };
      html.push(`<h${level} class="${styles[level]}">${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push('<ul class="my-2 space-y-1.5 pl-4">');
        inList = true;
      }
      html.push(
        `<li class="relative text-sm leading-relaxed text-foreground/90 before:absolute before:-left-4 before:text-muted-foreground before:content-['\\2022']">${inline(bullet[1])}</li>`,
      );
      continue;
    }

    closeList();
    html.push(`<p class="my-1.5 text-sm leading-relaxed text-foreground/90">${inline(line)}</p>`);
  }

  closeList();
  return html.join("\n");
}
