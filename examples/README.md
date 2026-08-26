# Code-readiness examples

One folder per OSS eval repo. Each folder is the full `/code-readiness` product output:

- `chat.md` — the three-line chat (level, top gate-ranked fix, canvas link)
- `code-readiness.canvas.tsx` — the canvas template (same as `canvas/code-readiness.canvas.tsx`)
- `code-readiness.canvas.data.json` — sidecar `{ "report": payload }` for `useCanvasState("report", null)`
- `report.html` — self-contained Cursor Light render of that sidecar
- `report.png` — full-length visual of the entire report (header through the failing-checks table)

Scores are from the n=27 honesty campaign (engine `246cfb46`, v17). `llm_calls=0`. These are filesystem-heuristic scores against eval stubs, not live clones.

Every folder has a full-length `report.png`.

| Repo | Level | Score | Folder | Visual |
| --- | --- | --- | --- | --- |
| BurntSushi/ripgrep | 1 Functional | 44% | [`BurntSushi__ripgrep`](./BurntSushi__ripgrep/) | [`report.png`](./BurntSushi__ripgrep/report.png) |
| cli/cli | 3 Standardized | 73% | [`cli__cli`](./cli__cli/) | [`report.png`](./cli__cli/report.png) |
| colinhacks/zod | 2 Documented | 68% | [`colinhacks__zod`](./colinhacks__zod/) | [`report.png`](./colinhacks__zod/report.png) |
| encode/httpx | 2 Documented | 50% | [`encode__httpx`](./encode__httpx/) | [`report.png`](./encode__httpx/report.png) |
| eslint/eslint | 2 Documented | 73% | [`eslint__eslint`](./eslint__eslint/) | [`report.png`](./eslint__eslint/report.png) |
| expressjs/express | 1 Functional | 47% | [`expressjs__express`](./expressjs__express/) | [`report.png`](./expressjs__express/report.png) |
| facebook/react | 2 Documented | 68% | [`facebook__react`](./facebook__react/) | [`report.png`](./facebook__react/report.png) |
| fastapi/fastapi | 2 Documented | 58% | [`fastapi__fastapi`](./fastapi__fastapi/) | [`report.png`](./fastapi__fastapi/report.png) |
| gin-gonic/gin | 2 Documented | 58% | [`gin-gonic__gin`](./gin-gonic__gin/) | [`report.png`](./gin-gonic__gin/report.png) |
| google/gson | 1 Functional | 50% | [`google__gson`](./google__gson/) | [`report.png`](./google__gson/report.png) |
| huggingface/diffusers | 2 Documented | 65% | [`huggingface__diffusers`](./huggingface__diffusers/) | [`report.png`](./huggingface__diffusers/report.png) |
| huggingface/transformers | 2 Documented | 71% | [`huggingface__transformers`](./huggingface__transformers/) | [`report.png`](./huggingface__transformers/report.png) |
| jqlang/jq | 1 Functional | 30% | [`jqlang__jq`](./jqlang__jq/) | [`report.png`](./jqlang__jq/report.png) |
| junit-team/junit5 | 1 Functional | 48% | [`junit-team__junit5`](./junit-team__junit5/) | [`report.png`](./junit-team__junit5/report.png) |
| koalaman/shellcheck | 1 Functional | 27% | [`koalaman__shellcheck`](./koalaman__shellcheck/) | [`report.png`](./koalaman__shellcheck/report.png) |
| microsoft/TypeScript | 2 Documented | 67% | [`microsoft__TypeScript`](./microsoft__TypeScript/) | [`report.png`](./microsoft__TypeScript/report.png) |
| nektos/act | 2 Documented | 65% | [`nektos__act`](./nektos__act/) | [`report.png`](./nektos__act/report.png) |
| nestjs/nest | 2 Documented | 76% | [`nestjs__nest`](./nestjs__nest/) | [`report.png`](./nestjs__nest/report.png) |
| pallets/click | 2 Documented | 62% | [`pallets__click`](./pallets__click/) | [`report.png`](./pallets__click/report.png) |
| pallets/flask | 2 Documented | 59% | [`pallets__flask`](./pallets__flask/) | [`report.png`](./pallets__flask/report.png) |
| prettier/prettier | 2 Documented | 74% | [`prettier__prettier`](./prettier__prettier/) | [`report.png`](./prettier__prettier/report.png) |
| psf/requests | 2 Documented | 63% | [`psf__requests`](./psf__requests/) | [`report.png`](./psf__requests/report.png) |
| redis/redis | 1 Functional | 44% | [`redis__redis`](./redis__redis/) | [`report.png`](./redis__redis/report.png) |
| socketio/chat-example | 1 Functional | 9% | [`socketio__chat-example`](./socketio__chat-example/) | [`report.png`](./socketio__chat-example/report.png) |
| spf13/cobra | 2 Documented | 48% | [`spf13__cobra`](./spf13__cobra/) | [`report.png`](./spf13__cobra/report.png) |
| tj/commander.js | 2 Documented | 59% | [`tj__commander.js`](./tj__commander.js/) | [`report.png`](./tj__commander.js/report.png) |
| tokio-rs/tokio | 2 Documented | 56% | [`tokio-rs__tokio`](./tokio-rs__tokio/) | [`report.png`](./tokio-rs__tokio/report.png) |
