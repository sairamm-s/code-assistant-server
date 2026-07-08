/**
 * Adapted from the team's Claude Code `/context` skill (~/.claude/commands/context.md),
 * generalized for arbitrary repos ingested by this app — no assumptions about a specific
 * team's folder conventions (screens/*.screen.tsx, node.md/react.md skills, etc).
 *
 * Used once per repository ingestion, in a single LLM call, fed with the file tree
 * and a handful of key files already collected during the chunking file-walk
 * (see docs/PLAN.md Section 10, build order item 6 — no agentic tool-use exploration
 * needed, since the file walk already has this data; see arch.md Section 8 for why).
 */

export interface RepositoryOverviewPromptInput {
  repoName: string;
  fileTree: string;
  keyFileContents: { path: string; content: string }[];
}

export const buildRepositoryOverviewPrompt = ({
  repoName,
  fileTree,
  keyFileContents,
}: RepositoryOverviewPromptInput): string => `
You are generating a structural overview of an unfamiliar codebase so that future questions about it can be answered accurately and efficiently, without re-reading the entire repository each time.

Repository: ${repoName}

File tree:
${fileTree}

Key file contents:
${keyFileContents.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

Produce a concise, structured overview covering:

1. **Stack** — languages, frameworks, major libraries, and how you inferred them (package manifests, config files, imports).
2. **Purpose** — what this application/service does, in plain language, based on what the code actually implements (not assumptions).
3. **Structure** — the meaningful top-level directories and what each is responsible for. If this looks like a multi-project repo (e.g. separate client/server folders), describe each part separately.
4. **Entry points** — where execution starts (main files, route registration, app bootstrap).
5. **Key modules** — the files/folders most likely to matter for future questions (core business logic, API routes, data models) — one line each, not exhaustive.
6. **Notable conventions** — anything unusual or important about how the codebase is organized, if evident (e.g. a consistent layered architecture, a specific state management pattern).

Rules:
- Only state what is evidenced by the file tree and file contents provided — do not speculate about files you were not shown.
- Keep it dense and factual. This will be injected into every chat about this repository as fixed context, so prioritize information that helps answer "what does this do" and "where is X" over exhaustive detail.
- Output plain text with clear section headers, no marketing language, no filler.
`.trim();
