# Check catalog

`checks/catalog.json` is the scoring spec. The agent evaluates every criterion with Read, glob, and grep only. Do not install packages. Do not run `npx`. Do not call Factory. Do not run tests, linters, or scanners.

v1 skips `requiresLLM` criteria. Those are a third state: skipped, excluded from the 80% denominator, not fails.

## How to evaluate a row

1. If `requiresLLM` is true, mark skipped.
2. Else look for files in `anyFiles` / `anyGlobs` (file or directory presence).
3. Else read listed files and grep `fileContains` / `fileRegex` / `ciGrep`.
4. Else apply special fields: `minBytes`, `tsconfigStrict`, `languagesPass`, `packageJsonPath`, `makefileTarget`, `lockFileFreshDays`, `testFiles`, `ciFiles`.
5. Presence of config is a pass. Never execute the tool the config describes.

`ai-context` looks for `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md` only. It does not check `AGENTS.md`. If `AGENTS.md` exists, mention it outside the denominator.

Go, Rust, Java, Kotlin, C#, and Swift auto-pass `type-checker`. Go, Rust, and C# auto-pass `formatter`. That is a language default, not a subprocess.

## Levels

1 Foundational, 2 Guided, 3 Structured, 4 Optimized, 5 Autonomous.

A level passes at 80% of that level's non-skipped checks. Levels are sequential. Minimum level is 1. Non-AI counts: L1=4 need 4, L2=10 need 8, L3=12 need 10, L4=8 need 7, L5=1 need 1 (`bundle-analysis`). If the report would show Level 5, add the disclaimer. Do not celebrate Autonomous.

Optional helper: `node scripts/code-readiness.mjs <repo>` applies this same catalog with Node `fs` only. No npm install.
