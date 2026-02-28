/**
 * Build-time script: extract MDX content → Pagefind index.
 *
 * Usage: node scripts/build-search-index.mjs
 * Called automatically via `pnpm build` postbuild.
 *
 * Reads all .mdx files from src/pages/docs/, strips JSX/MDX syntax,
 * and feeds plain text into Pagefind's Node API as custom records.
 * Output: dist/client/pagefind/
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as pagefind from "pagefind";

const DOCS_DIR = "src/pages/docs";
const OUTPUT_DIR = "public/pagefind";

// Section mapping: filename → { section, title fallback }
const SECTION_MAP = {
    quickstart: "User Guide",
    "models-routing": "User Guide",
    "credentials-sharing": "User Guide",
    pricing: "User Guide",
    billing: "User Guide",
    authentication: "API Reference",
    "openai-api": "API Reference",
    "anthropic-api": "API Reference",
    "error-codes": "API Reference",
    "models-api": "API Reference",
    "credits-api": "API Reference",
    "terms-of-service": "Support",
    "privacy-policy": "Support",
    contact: "Support",
    introduction: "About",
};

/** Strip MDX/JSX syntax → plain text for indexing */
function mdxToPlainText(raw) {
    return (
        raw
            // Remove import statements
            .replace(/^import\s+.*$/gm, "")
            // Remove JSX tags (self-closing and open/close)
            .replace(/<[^>]+\/?>/g, " ")
            // Remove markdown links, keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            // Remove inline code backticks
            .replace(/`([^`]+)`/g, "$1")
            // Remove code fences
            .replace(/```[\s\S]*?```/g, "")
            // Remove heading markers
            .replace(/^#{1,4}\s+/gm, "")
            // Remove markdown emphasis
            .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
            // Remove table separators
            .replace(/\|[-:]+\|/g, "")
            // Remove pipe characters from tables
            .replace(/\|/g, " ")
            // Remove blockquote markers
            .replace(/^>\s*/gm, "")
            // Collapse whitespace
            .replace(/\s+/g, " ")
            .trim()
    );
}

/** Extract the first # heading as the document title */
function extractTitle(raw) {
    const match = raw.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
}

async function main() {
    const { index } = await pagefind.createIndex();
    if (!index) throw new Error("Failed to create pagefind index");

    const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith(".mdx"));

    let count = 0;
    for (const file of files) {
        const slug = file.replace(".mdx", "");
        const raw = await readFile(join(DOCS_DIR, file), "utf-8");
        const title = extractTitle(raw) || slug;
        const content = mdxToPlainText(raw);
        const section = SECTION_MAP[slug] || "Docs";

        if (content.length < 10) continue;

        await index.addCustomRecord({
            url: `/docs/${slug}`,
            content,
            language: "en",
            meta: { title, section },
        });
        count++;
    }

    await index.writeFiles({ outputPath: OUTPUT_DIR });
    console.log(`✓ Pagefind: indexed ${count} docs → ${OUTPUT_DIR}`);

    await pagefind.close();
}

main().catch((err) => {
    console.error("Pagefind indexing failed:", err);
    process.exit(1);
});
