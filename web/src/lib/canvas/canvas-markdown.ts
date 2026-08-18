export type MarkdownHeading = {
    id: string;
    level: 1 | 2 | 3;
    text: string;
};

export type MarkdownInfo = {
    title: string;
    summary: string;
    wordCount: number;
    headingCount: number;
    headings: MarkdownHeading[];
};

export type MarkdownSection = {
    id: string;
    title: string;
    content: string;
};

export function markdownHeadingAnchor(text: string, index: number) {
    const slug = text
        .trim()
        .toLowerCase()
        .replace(/[`*_~[\]()#+.!?，。！？、：:；;'"“”‘’]/g, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `markdown-heading-${index}-${slug || "section"}`;
}

export function parseMarkdownHeadings(markdown: string): MarkdownHeading[] {
    const headings: MarkdownHeading[] = [];
    let activeFence: "```" | "~~~" | null = null;
    markdown.split(/\r?\n/).forEach((line) => {
        const fenceMatch = /^\s*(```|~~~)/.exec(line);
        if (fenceMatch) {
            const fence = fenceMatch[1] as "```" | "~~~";
            activeFence = activeFence === fence ? null : activeFence || fence;
            return;
        }
        if (activeFence) return;
        const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
        if (!match) return;
        const text = stripInlineMarkdown(match[2]).trim();
        if (!text) return;
        headings.push({ id: markdownHeadingAnchor(text, headings.length), level: match[1].length as 1 | 2 | 3, text });
    });
    return headings;
}

export function markdownInfo(markdown: string, fallbackTitle: string): MarkdownInfo {
    const headings = parseMarkdownHeadings(markdown);
    const plain = stripMarkdown(markdown);
    const title = headings.find((heading) => heading.level === 1)?.text || fallbackTitle || "文档";
    return {
        title,
        summary: plain
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 4)
            .join("\n"),
        wordCount: countReadableChars(plain),
        headingCount: headings.length,
        headings,
    };
}

export function splitMarkdownSections(markdown: string): MarkdownSection[] {
    const whole = [{ id: "markdown-section-all", title: "全文", content: markdown }];
    const headings: Array<{ offset: number; level: number; text: string }> = [];
    let activeFence: "```" | "~~~" | null = null;
    const linePattern = /.*(?:\n|$)/g;
    for (const match of markdown.matchAll(linePattern)) {
        const line = match[0].replace(/\r?\n$/, "");
        if (!line && match.index === markdown.length) break;
        const fenceMatch = /^\s*(```|~~~)/.exec(line);
        if (fenceMatch) {
            const fence = fenceMatch[1] as "```" | "~~~";
            activeFence = activeFence === fence ? null : activeFence || fence;
            continue;
        }
        if (activeFence) continue;
        const headingMatch = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
        if (headingMatch) headings.push({ offset: match.index || 0, level: headingMatch[1].length, text: stripInlineMarkdown(headingMatch[2]).trim() });
    }

    const splitLevel = [1, 2, 3].find((level) => headings.filter((heading) => heading.level === level).length > 1);
    if (!splitLevel) return whole;
    const boundaries = headings.filter((heading) => heading.level === splitLevel);
    return boundaries.map((heading, index) => ({
        id: `markdown-section-${index}`,
        title: heading.text,
        content: markdown.slice(index === 0 ? 0 : heading.offset, boundaries[index + 1]?.offset ?? markdown.length),
    }));
}

function stripMarkdown(markdown: string) {
    return markdown
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function stripInlineMarkdown(value: string) {
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_~`]/g, "");
}

function countReadableChars(value: string) {
    return value.replace(/\s/g, "").length;
}
