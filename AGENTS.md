# bio-exam

## CodeGraph

Code intelligence runs on CodeGraph: a local index in `.codegraph/`, reached through the `codegraph_*` MCP tools or the `codegraph` CLI. Reach for it before grep or reading files:

- Understanding an area, or any question about the code: `codegraph explore "<symbols or question>"`.
- One symbol with its callers, or a file with line numbers: `codegraph node <symbol-or-file>`.
- Before editing a symbol: `codegraph impact <symbol>`, and report the affected callers.
- Choosing tests for a change: `codegraph affected <changed files>`.

When `.codegraph/` is missing, say so and work from `rg` and direct reads; `codegraph init` builds the index.

## Decisions and plans

- Architecture decisions live in `docs/adr/`. Read the relevant ADR before changing auth, the exam domain, file storage, or module structure.
- Implementation plans and their order: `plans/README.md`.
