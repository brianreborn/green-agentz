---
name: green-format
description: Normalize markdown to the green-agency style guide, map sources into MANUSCRIPT.json chapters, and run workspace Makefiles without corrupting the source tree. Triggers include green-format, normalize manuscript, MANUSCRIPT.json layout, prose uniformity, or non-destructive make.
metadata:
  type: workflow
  version: "1.0"
---

# Green Format

Manuscript body is prose: do not run GDICT on chapter text. Receipts and make/compiler tails use `../green-agency/assets/gdict-1.0.0.txt` and `gdict-errors-1.0.0.txt`.

## REQ-SK03-01 — Prose uniformity

Rewrite markdown to the STYLE_GUIDE in REQUIREMENTS.md section 1:

- High-density technical diction
- Terse headings, lists, and tables
- No AI scaffolding, no filler transitions, no emoji unless the source already used them
- POSIX line endings, no trailing whitespace, at most two consecutive blank lines

Run `scripts/normalize-md.sh FILE` and write the result with `green-agency/scripts/safe-write.sh` (creates `.bak`).

## REQ-SK03-02 — Code-to-prose sync

Maintain a master `MANUSCRIPT.json` at the workspace root. Schema template is `assets/MANUSCRIPT.schema.json`.

Each chapter maps `id`, `title`, `sources` (relative paths), and `prose`. When code changes, update the matching chapter's `sources` list and a one-paragraph prose gloss. Do not duplicate full source text inside the JSON.

If `MANUSCRIPT.json` is absent, create it from ingested files grouped by directory or language. Use `safe-write.sh`.

## REQ-SK03-03 — Non-destructive compilation

If a `Makefile` exists:

1. Snapshot any file the Makefile might overwrite (REQ-SYS-03) before `make`.
2. Prefer `make -n` first. Then `make` only targets that write under `.runtime/` or explicitly named outputs.
3. Never let make delete or reformat the master source tree. Restore from `.bak` if a target rewrites a source path.
4. Pipe make output through `green-agency/scripts/output-proxy.sh`.

## Output

```
FORMAT manuscript=<path> chapters=N normalized=N make=<OK|SKIP|FAIL>
```
