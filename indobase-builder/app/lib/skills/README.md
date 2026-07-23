# Builder LLM skills

Vendored **web-development** skills from
[davila7/claude-code-templates](https://github.com/davila7/claude-code-templates)
(`cli-tool/components/skills/web-development`), MIT licensed.

| Path | Purpose |
|------|---------|
| `web-development/*/SKILL.md` | Upstream skill sources (attribution / regeneration) |
| `web-skill-catalog.generated.ts` | Embedded catalog used at runtime (bundled into Remix server) |
| `select-web-skills.ts` | Stack/prompt-aware selection + system-prompt appendix |
| `NOTICE` / `LICENSE-claude-code-templates.txt` | Upstream attribution |

Runtime injection happens in `app/lib/.server/llm/stream-text.ts` for **build**
mode only. Selection is capped (count + character budget) — the catalog is never
dumped wholesale. Model routing stays in `openrouter-model-policy.ts` (no UI picker).
