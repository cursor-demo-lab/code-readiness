# Code-readiness examples

One folder per OSS eval repo. Each folder is the full `/code-readiness` product output:

- `chat.md` — the three-line chat (level, top gate-ranked fix, canvas link)
- `code-readiness.canvas.tsx` — the canvas template (same as `canvas/code-readiness.canvas.tsx`)
- `code-readiness.canvas.data.json` — sidecar `{ "report": payload }` for `useCanvasState("report", null)`

Scores are from the n=27 honesty campaign (engine `246cfb46`, v17). `llm_calls=0`. These are filesystem-heuristic scores against eval stubs, not live clones.

| Repo | Level | Score | Folder |
| --- | --- | --- | --- |
| BurntSushi/ripgrep | 1 Functional | 44% | [`BurntSushi__ripgrep`](./BurntSushi__ripgrep/) |
| cli/cli | 3 Standardized | 73% | [`cli__cli`](./cli__cli/) |
| colinhacks/zod | 2 Documented | 68% | [`colinhacks__zod`](./colinhacks__zod/) |
| encode/httpx | 2 Documented | 50% | [`encode__httpx`](./encode__httpx/) |
| eslint/eslint | 2 Documented | 73% | [`eslint__eslint`](./eslint__eslint/) |
| expressjs/express | 1 Functional | 47% | [`expressjs__express`](./expressjs__express/) |
| facebook/react | 2 Documented | 68% | [`facebook__react`](./facebook__react/) |
| fastapi/fastapi | 2 Documented | 58% | [`fastapi__fastapi`](./fastapi__fastapi/) |
| gin-gonic/gin | 2 Documented | 58% | [`gin-gonic__gin`](./gin-gonic__gin/) |
| google/gson | 1 Functional | 50% | [`google__gson`](./google__gson/) |
| huggingface/diffusers | 2 Documented | 65% | [`huggingface__diffusers`](./huggingface__diffusers/) |
| huggingface/transformers | 2 Documented | 71% | [`huggingface__transformers`](./huggingface__transformers/) |
| jqlang/jq | 1 Functional | 30% | [`jqlang__jq`](./jqlang__jq/) |
| junit-team/junit5 | 1 Functional | 48% | [`junit-team__junit5`](./junit-team__junit5/) |
| koalaman/shellcheck | 1 Functional | 27% | [`koalaman__shellcheck`](./koalaman__shellcheck/) |
| microsoft/TypeScript | 2 Documented | 67% | [`microsoft__TypeScript`](./microsoft__TypeScript/) |
| nektos/act | 2 Documented | 65% | [`nektos__act`](./nektos__act/) |
| nestjs/nest | 2 Documented | 76% | [`nestjs__nest`](./nestjs__nest/) |
| pallets/click | 2 Documented | 62% | [`pallets__click`](./pallets__click/) |
| pallets/flask | 2 Documented | 59% | [`pallets__flask`](./pallets__flask/) |
| prettier/prettier | 2 Documented | 74% | [`prettier__prettier`](./prettier__prettier/) |
| psf/requests | 2 Documented | 63% | [`psf__requests`](./psf__requests/) |
| redis/redis | 1 Functional | 44% | [`redis__redis`](./redis__redis/) |
| socketio/chat-example | 1 Functional | 9% | [`socketio__chat-example`](./socketio__chat-example/) |
| spf13/cobra | 2 Documented | 48% | [`spf13__cobra`](./spf13__cobra/) |
| tj/commander.js | 2 Documented | 59% | [`tj__commander.js`](./tj__commander.js/) |
| tokio-rs/tokio | 2 Documented | 56% | [`tokio-rs__tokio`](./tokio-rs__tokio/) |
