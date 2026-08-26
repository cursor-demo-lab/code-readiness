import {
  BarChart,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Code,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  LineChart,
  Link,
  PieChart,
  Pill,
  Row,
  Select,
  Spacer,
  Stack,
  Stat,
  Swatch,
  Table,
  Text,
  TextInput,
  TodoListCard,
  Toggle,
  UsageBar,
  computeDAGLayout,
  useCanvasAction,
  useCanvasState,
  useHostTheme,
  type ChartTone,
  type TableRowTone,
  type TodoItem,
} from "cursor/canvas";

type CriterionRow = {
  pillarId: string;
  pillarName: string;
  criterionId: string;
  name: string;
  level: number | null;
  requiresLLM: boolean;
  pass: boolean;
  skipped: boolean;
  message: string;
  details?: string;
  fix?: string;
};

type Remediation = {
  id: string;
  title: string;
  description: string;
  reason: string;
  effort: string;
  impact: string;
  pillarId: string;
  criterionId: string;
};

type PillarScore = {
  pillarId: string;
  name: string;
  passed: number;
  total: number;
  percentage: number;
};

type Report = {
  repo_identity: {
    name: string;
    path: string;
    gitSha: string | null;
    scope: "repository root only";
    url?: string;
    githubUrl?: string;
    html_url?: string;
  };
  maturity_level: {
    level: 1 | 2 | 3 | 4 | 5;
    label: string;
    scorePercent: number;
    nextLevel: number | null;
    nextLevelLabel: string | null;
    nextLevelCurrent: number;
    nextLevelNeeded: number;
    nextLevelRemaining: number;
    l2Passed: number;
    l2Total: number;
    l1CapReasons: string[];
    l1Capped: boolean;
  };
  pillar_scores: PillarScore[];
  criterion_results: CriterionRow[];
  remediations: Remediation[];
  run_metadata: {
    engine: string;
    catalogHash: string;
    generated_at: string;
    gitSha: string | null;
    check_count: number;
    llm_calls: 0;
    skipped_ai_count: number;
    duration_ms: number;
    cacheHit: boolean;
    scope: "repository root only";
  };
  thesis: string;
  level5Disclaimer: string | null;
  agentsMdNote: string | null;
  attribution: string;
};

const LEVELS: Array<{ level: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { level: 1, label: "Functional" },
  { level: 2, label: "Documented" },
  { level: 3, label: "Standardized" },
  { level: 4, label: "Optimized" },
  { level: 5, label: "Autonomous" },
];

const OPEN_BY_ID: Record<string, string> = {
  editorconfig: ".editorconfig",
  linter: "eslint.config.js",
  formatter: ".prettierrc",
  "pre-commit-hooks": ".pre-commit-config.yaml",
  "test-framework": "jest.config.js",
  "test-script": "package.json",
  "coverage-config": ".coveragerc",
  "e2e-tests": "playwright.config.ts",
  readme: "README.md",
  contributing: "CONTRIBUTING.md",
  "api-docs": "openapi.yaml",
  codeowners: "CODEOWNERS",
  "ai-context": "CLAUDE.md",
  "architecture-docs": "ARCHITECTURE.md",
  "lock-file": "package-lock.json",
  "env-documentation": ".env.example",
  "setup-script": "Makefile",
  "version-pinned": ".mise.toml",
  containerization: ".cursor/environment.json",
  "ci-config": ".github/workflows/ci.yml",
  "ci-runs-tests": ".github/workflows/ci.yml",
  "ci-runs-linters": ".github/workflows/ci.yml",
  "build-automated": "package.json",
  "deploy-pipeline": "vercel.json",
  "branch-protection": ".github/settings.yml",
  "no-outdated-deps": "package-lock.json",
  "dead-code-detection": "knip.json",
  "bundle-analysis": ".size-limit.json",
  license: "LICENSE",
  "security-policy": "SECURITY.md",
  "dep-update-automation": ".github/dependabot.yml",
  "security-scanning": ".snyk",
  "secrets-detection": ".gitleaks.toml",
};

const WHY_FOR_AGENTS: Record<string, string> = {
  editorconfig:
    "Add .editorconfig only when there is no linter. A linter is the agent-runnable style oracle. Do not dummy .editorconfig.",
  linter:
    "Agents generate code that looks right. A linter is a cheap local oracle they can loop on after each edit.",
  formatter:
    "Without a formatter, agent diffs are mostly whitespace. Format-on-write keeps the real change visible.",
  "type-checker":
    "Agents hallucinate APIs. tsconfig or mypy is a local proof they can rerun without starting the app.",
  "pre-commit-hooks":
    "Agents skip the human lint step. Hooks make the default commit path the same as CI.",
  "test-framework":
    "Agents need a named runner. A configured framework tells them how to verify a change in one command.",
  "test-files-exist":
    "A test file is a fixture the agent can extend instead of inventing coverage from scratch.",
  "test-script":
    "scripts.test or make test is the one command an agent will actually run.",
  "ai-context":
    "AGENTS.md is onboarding. Without it, agents scrape the README and invent conventions and how to run one test.",
  contributing:
    "PR title, commit, and review rules. Agents otherwise open PRs that bounce on process, not code.",
  readme:
    "The README is the first file an agent reads. Substance here is the difference between a useful first patch and a wrong one.",
  "env-documentation":
    "Agents invent .env values or commit secrets. An example file is the schema for local boot.",
  "lock-file":
    "Agents resolve different versions than CI. A lockfile makes install reproducible.",
  "version-pinned":
    "Agents pick Node or Python from the host. engines / python_requires / go.mod tell them which toolchain to assume.",
  "setup-script":
    "Agents need how to run this. scripts.dev, Makefile, or setup.py is that answer.",
  "ci-config":
    "CI is the remote oracle. Workflow files tell the agent what green means.",
  "api-docs":
    "Agents guess the public surface. OpenAPI or TypeDoc is a typed map of what callers expect.",
  codeowners:
    "Agents do not know who can review a path. CODEOWNERS routes the PR and names the expert.",
  "architecture-docs":
    "Agents change the wrong layer. ADRs tell them the intended seams.",
  containerization:
    "Cursor Cloud Agent `.cursor/environment.json` is a boot/container signal agents can run; root `environment.json` is not a hit.",
  "branch-protection":
    "Documented branch rules stop agents from pushing around review.",
  "dead-code-detection":
    "Agents add files and rarely delete. Unused-export checks keep generated code from rotting.",
  "secrets-detection":
    "Agents paste keys into examples. A detector is the last gate before that lands on main.",
  license:
    "Agents need to know what they can copy. A LICENSE at root is the legal context for generated code.",
  "coverage-config":
    "Without a coverage config, agents cannot tell which lines their tests missed. .coveragerc or .nycrc is the local coverage oracle.",
  "e2e-tests":
    "Unit tests miss browser and HTTP seams. playwright.config or an e2e directory is the path an agent uses to catch those.",
  "ci-runs-tests":
    "A CI file that never runs tests is a green that lies. The agent needs a test step as the remote oracle.",
  "ci-runs-linters":
    "Agents skip the local lint loop. A CI lint step is the remote style oracle when they cannot run the linter themselves.",
  "build-automated":
    "Agents need one compile command. scripts.build or a CI build step is how they know the artifact still builds.",
  "deploy-pipeline":
    "Agents do not know how this ships. vercel.json or a deploy stage is the release path they must not invent.",
  "no-outdated-deps":
    "A stale lockfile means agents install versions CI never saw. A current lock is the install contract.",
  "bundle-analysis":
    "Agents add dependencies without seeing size. size-limit is a local budget they can fail on before merge.",
  "security-policy":
    "Agents need a documented disclosure path. SECURITY.md is where they report a leaked secret instead of opening a public issue.",
  "dep-update-automation":
    "Agents bump versions once and miss the next advisory. Dependabot or Renovate is the recurring update path they will not invent.",
  "security-scanning":
    "Agents cannot audit every dependency. A CI scanner config is the remote vuln oracle they can fail on before merge.",
  "naming-conventions":
    "Without documented naming, agents invent identifiers that fail review on style, not behavior.",
  "test-quality":
    "Agents copy shallow tests. Named edge cases are the fixture they extend instead of asserting the happy path twice.",
  "readme-quality":
    "A README that exists but skips install and test leaves agents guessing the first command.",
  "docs-agent-friendliness":
    "Agents need structure and how to run one test in docs, not a marketing homepage.",
};

const WHY_FOR_AGENTS_FALLBACK =
  "This file is a machine-readable signal agents can follow without guessing.";

const CONCRETE_PATHS = [
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".github/settings.yml",
  ".github/CODEOWNERS",
  ".cursor/environment.json",
  ".pre-commit-config.yaml",
  "playwright.config.ts",
  "eslint.config.js",
  "jest.config.js",
  "package-lock.json",
  ".size-limit.json",
  ".gitleaks.toml",
  "openapi.yaml",
  ".coveragerc",
  ".prettierrc",
  ".mise.toml",
  "knip.json",
  "vercel.json",
  ".editorconfig",
  ".env.example",
  "CONTRIBUTING.md",
  "ARCHITECTURE.md",
  "SECURITY.md",
  "README.md",
  "CLAUDE.md",
  "CODEOWNERS",
  "LICENSE",
  "tsconfig.json",
  "package.json",
  ".cursorrules",
  ".nvmrc",
  "Dockerfile",
  "Makefile",
  ".snyk",
];

const DAG_NODE_WIDTH = 88;
const DAG_NODE_HEIGHT = 40;

function scoreChartTone(percent: number): ChartTone {
  if (percent >= 80) return "success";
  if (percent >= 50) return "warning";
  return "danger";
}

function failOpenPath(row: CriterionRow): string | null {
  const mapped = OPEN_BY_ID[row.criterionId];
  if (mapped) return mapped;
  const blob = `${row.name} ${row.message} ${row.fix ?? ""} ${row.details ?? ""}`;
  return CONCRETE_PATHS.find((file) => blob.includes(file)) ?? null;
}

function joinIds(ids: string[]): string {
  return ids.join(", ");
}

function remainingGateFails(report: Report): CriterionRow[] {
  const band = report.maturity_level;
  if (band.l1Capped) {
    const ids = new Set(band.l1CapReasons);
    return report.criterion_results.filter((row) => ids.has(row.criterionId));
  }
  if (band.nextLevel == null) return [];
  return report.criterion_results.filter(
    (row) => row.level === band.nextLevel && !row.skipped && !row.pass,
  );
}

function rankedFixRows(report: Report): CriterionRow[] {
  const gate = remainingGateFails(report);
  const gateIds = new Set(gate.map((row) => row.criterionId));
  const rest = report.criterion_results.filter(
    (row) => !row.pass && !row.skipped && !gateIds.has(row.criterionId),
  );
  const byFileThenCatalog = (a: CriterionRow, b: CriterionRow) => {
    const aFile = failOpenPath(a) == null ? 1 : 0;
    const bFile = failOpenPath(b) == null ? 1 : 0;
    if (aFile !== bFile) return aFile - bFile;
    return 0;
  };
  return [
    ...gate.slice().sort(byFileThenCatalog),
    ...rest.slice().sort(byFileThenCatalog),
  ].slice(0, 5);
}

function todoLine(row: CriterionRow): string {
  const file = failOpenPath(row);
  if (file) return `${row.criterionId} — add ${file}`;
  const hint = row.fix || row.message;
  return hint ? `${row.criterionId} — ${hint}` : row.criterionId;
}

function whyForAgents(criterionId: string): string {
  return WHY_FOR_AGENTS[criterionId] ?? WHY_FOR_AGENTS_FALLBACK;
}

function countedPillarFails(
  report: Report,
  pillarId: string,
): CriterionRow[] {
  return report.criterion_results.filter(
    (row) => row.pillarId === pillarId && !row.skipped && !row.pass,
  );
}

function nextGateCallout(
  report: Report,
): { title: string; body: string } | null {
  const band = report.maturity_level;
  if (band.l1Capped) {
    return {
      title: "L1 capped",
      body: `Passed the L2 gate (${band.l2Passed}/${band.l2Total}) but stuck on ${joinIds(band.l1CapReasons)}. Sequential 80% gate. This cap is why the band stays Functional.`,
    };
  }
  if (report.level5Disclaimer) {
    return {
      title: "Level 5 is not Autonomous here",
      body: report.level5Disclaimer,
    };
  }
  if (band.nextLevel == null || band.nextLevelLabel == null) return null;
  const ids = remainingGateFails(report).map((row) => row.criterionId);
  const except = ids.length > 0 ? ` except ${joinIds(ids)}` : "";
  return {
    title: `Would be ${band.nextLevelLabel}`,
    body: `Would be ${band.nextLevelLabel}${except}. Have ${band.nextLevelCurrent}, need ${band.nextLevelNeeded} Level ${band.nextLevel} checks. Sequential 80% gate. Skipped AI checks are excluded from the denominator.`,
  };
}

function rowTone(row: CriterionRow): TableRowTone {
  if (row.skipped) return "neutral";
  return row.pass ? "success" : "danger";
}

function identityUrl(identity: Report["repo_identity"]): string | null {
  const candidates = [identity.url, identity.githubUrl, identity.html_url];
  return (
    candidates.find(
      (value) => typeof value === "string" && /^https?:\/\//.test(value),
    ) ?? null
  );
}

function SequentialGateDag({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const theme = useHostTheme();
  const layout = computeDAGLayout({
    nodes: LEVELS.map((item) => ({ id: `L${item.level}` })),
    edges: LEVELS.slice(0, -1).map((item) => ({
      from: `L${item.level}`,
      to: `L${item.level + 1}`,
    })),
    direction: "horizontal",
    nodeWidth: DAG_NODE_WIDTH,
    nodeHeight: DAG_NODE_HEIGHT,
    rankGap: 28,
    nodeGap: 24,
    padding: 8,
  });

  return (
    <svg
      width={layout.width}
      height={layout.height}
      role="img"
      aria-label={`Sequential maturity gate, current level ${current}`}
    >
      {layout.edges.map((edge) => (
        <line
          key={`${edge.from}-${edge.to}`}
          x1={edge.sourceX}
          y1={edge.sourceY}
          x2={edge.targetX}
          y2={edge.targetY}
          stroke={theme.stroke.secondary}
          strokeWidth={1.5}
        />
      ))}
      {layout.nodes.map((node) => {
        const level = Number(node.id.slice(1)) as 1 | 2 | 3 | 4 | 5;
        const active = level === current;
        const reached = level <= current;
        const label = LEVELS.find((item) => item.level === level)?.label ?? node.id;
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={DAG_NODE_WIDTH}
              height={DAG_NODE_HEIGHT}
              rx={6}
              fill={
                active
                  ? theme.accent.primary
                  : reached
                    ? theme.fill.secondary
                    : theme.fill.tertiary
              }
              stroke={active ? theme.accent.primary : theme.stroke.tertiary}
            />
            <text
              x={node.x + DAG_NODE_WIDTH / 2}
              y={node.y + DAG_NODE_HEIGHT / 2 + 4}
              textAnchor="middle"
              fill={active ? theme.text.onAccent : theme.text.primary}
              fontSize={12}
            >
              {node.id}
            </text>
            <title>{active ? `${label} (current)` : label}</title>
          </g>
        );
      })}
    </svg>
  );
}

export default function CodeReadinessCanvas() {
  const theme = useHostTheme();
  const dispatch = useCanvasAction();
  const [report] = useCanvasState<Report | null>("report", null);
  const [pillarFilter, setPillarFilter] = useCanvasState("pillarFilter", "all");
  const [failsOnly, setFailsOnly] = useCanvasState("failsOnly", true);
  const [failSearch, setFailSearch] = useCanvasState("failSearch", "");
  const [l1CappedOnly, setL1CappedOnly] = useCanvasState("l1CappedOnly", false);
  const pageStyle = { color: theme.text.primary };

  if (report == null) {
    return (
      <Stack gap={24} style={pageStyle}>
        <Text size="small" tone="tertiary" weight="semibold">
          /CODE-READINESS
        </Text>
        <H1>Code Readiness</H1>
        <Text>
          No report sidecar yet. Walk checks/catalog.json with /code-readiness
          and write code-readiness.canvas.data.json.
        </Text>
      </Stack>
    );
  }

  const band = report.maturity_level;
  const meta = report.run_metadata;
  const counted = report.criterion_results.filter((row) => !row.skipped);
  const passedCount = counted.filter((row) => row.pass).length;
  const failedCount = counted.length - passedCount;
  const skippedCount = report.criterion_results.filter((row) => row.skipped).length;
  const gateRows = remainingGateFails(report);
  const rankedRows = rankedFixRows(report);
  const todos: TodoItem[] = rankedRows.map((row) => ({
    id: row.criterionId,
    content: todoLine(row),
    status: "pending",
  }));
  const openable = rankedRows
    .map((row) => ({ row, path: failOpenPath(row) }))
    .filter((entry): entry is { row: CriterionRow; path: string } => entry.path != null);
  const topFailPath = openable[0]?.path ?? null;
  const unblockFiles = openable.map((entry) => entry.path).slice(0, 3);
  const sha = report.repo_identity.gitSha
    ? report.repo_identity.gitSha.slice(0, 12)
    : "no git sha";
  const repoHref = identityUrl(report.repo_identity);
  const gapCallout = nextGateCallout(report);
  const todoHeading = band.l1Capped
    ? "Clear the L1 cap"
    : band.nextLevelLabel != null
      ? `Unblock ${band.nextLevelLabel}`
      : "Fix these first";
  const unblockHint =
    unblockFiles.length === 0 || band.nextLevelLabel == null
      ? null
      : `Add ${joinIds(unblockFiles)} to move toward ${band.nextLevelLabel}.`;
  const pieData = [
    { label: "Pass", value: passedCount, tone: "success" as const },
    { label: "Fail", value: failedCount, tone: "danger" as const },
    { label: "Skip", value: skippedCount, tone: "neutral" as const },
  ].filter((slice) => slice.value > 0);
  const query = failSearch.trim().toLowerCase();
  const visibleRows = report.criterion_results.filter((row) => {
    if (pillarFilter !== "all" && row.pillarId !== pillarFilter) return false;
    if (failsOnly && (row.pass || row.skipped)) return false;
    if (l1CappedOnly) {
      const capIds = band.l1CapReasons;
      if (capIds.length > 0) {
        if (!capIds.includes(row.criterionId)) return false;
      } else if (!(row.level === 1 && !row.pass && !row.skipped)) {
        return false;
      }
    }
    if (query) {
      if (row.pass || row.skipped) return false;
      const blob =
        `${row.name} ${row.criterionId} ${row.message} ${row.fix ?? ""} ${row.details ?? ""}`.toLowerCase();
      if (!blob.includes(query)) return false;
    }
    return true;
  });
  const tableGroups = report.pillar_scores
    .map((score) => ({
      pillarId: score.pillarId,
      name: score.name,
      percentage: score.percentage,
      rows: visibleRows.filter((row) => row.pillarId === score.pillarId),
    }))
    .filter((group) => group.rows.length > 0);
  const pillarOptions = [
    { value: "all", label: "All pillars" },
    ...report.pillar_scores.map((pillar) => ({
      value: pillar.pillarId,
      label: pillar.name,
    })),
  ];
  const remainingByLevel = LEVELS.map((item) =>
    report.criterion_results.filter(
      (row) => row.level === item.level && !row.skipped && !row.pass,
    ).length,
  );
  const checksHeading = l1CappedOnly
    ? "L1-capped checks"
    : query
      ? "Matching failing checks"
      : failsOnly
        ? "Failing checks"
        : "All checks";

  return (
    <Stack gap={24} style={pageStyle}>
      <Stack gap={12}>
        <Text size="small" tone="tertiary" weight="semibold">
          /CODE-READINESS
        </Text>
        <Row gap={8} align="center">
          <H1>{report.repo_identity.name}</H1>
          <Spacer />
          <Pill active>{band.label}</Pill>
          {band.l1Capped ? <Pill active>L1 capped</Pill> : null}
        </Row>
        {repoHref ? (
          <Text size="small" tone="tertiary">
            <Link href={repoHref}>{report.repo_identity.name}</Link>
          </Text>
        ) : null}
        <Row gap={8} align="center" wrap>
          {LEVELS.map((item) => (
            <Pill
              key={item.level}
              size="sm"
              active={band.level === item.level}
              tone={band.level === item.level ? "warning" : "neutral"}
              title={item.label}
            >
              {`L${item.level}`}
            </Pill>
          ))}
        </Row>
        <Row gap={24} align="center">
          <Stat value={`Level ${band.level}`} label={band.label} />
          <Stat
            value={`${band.scorePercent}%`}
            label="Counted checks"
            tone={band.scorePercent >= 80 ? "success" : undefined}
          />
        </Row>
        {counted.length > 0 ? (
          <UsageBar
            total={counted.length}
            topLeftLabel={`${passedCount} / ${counted.length} counted`}
            topRightLabel={`${failedCount} failed`}
            segments={[
              { id: "passed", value: passedCount, color: "green" },
              { id: "failed", value: failedCount, color: "red" },
            ]}
          />
        ) : null}
        <Text>{report.thesis}</Text>
        <Text size="small" tone="tertiary">
          {report.attribution} Generated {meta.generated_at}. Git {sha}.{" "}
          {report.repo_identity.scope}. llm_calls={meta.llm_calls}.
        </Text>
        {report.agentsMdNote ? (
          <Text size="small" tone="tertiary">
            {report.agentsMdNote}
          </Text>
        ) : null}
      </Stack>

      {gapCallout ? (
        <Callout tone="warning" title={gapCallout.title}>
          {gapCallout.body}
        </Callout>
      ) : null}

      {gateRows.length > 0 ? (
        <Row gap={8} wrap>
          {gateRows.map((row) => (
            <Pill key={row.criterionId} size="sm" tone="warning">
              {row.criterionId}
            </Pill>
          ))}
        </Row>
      ) : null}

      {todos.length > 0 ? (
        <Stack gap={12}>
          <H2>{todoHeading}</H2>
          {unblockHint ? <Text>{unblockHint}</Text> : null}
          <TodoListCard
            todos={todos}
            defaultExpanded
            onTodoClick={(todo) => {
              const row = rankedRows.find((item) => item.criterionId === todo.id);
              const file = row ? failOpenPath(row) : null;
              if (file) dispatch({ type: "openFile", path: file });
            }}
          />
          {openable.length > 0 ? (
            <Row gap={8} wrap>
              {openable.map((entry) => (
                <Button
                  key={entry.row.criterionId}
                  variant="secondary"
                  onClick={() => dispatch({ type: "openFile", path: entry.path })}
                >
                  {`Open ${entry.path}`}
                </Button>
              ))}
            </Row>
          ) : topFailPath ? (
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "openFile", path: topFailPath })}
            >
              {`Open ${topFailPath}`}
            </Button>
          ) : null}
        </Stack>
      ) : topFailPath ? (
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "openFile", path: topFailPath })}
        >
          {`Open ${topFailPath}`}
        </Button>
      ) : null}

      {pieData.length > 0 ? (
        <Stack gap={12}>
          <H2>Pass, fail, skip</H2>
          <Row gap={24} align="center">
            <PieChart data={pieData} donut />
            <Stack gap={8}>
              <Row gap={8} align="center">
                <Swatch color="green" />
                <Text size="small">Pass</Text>
              </Row>
              <Row gap={8} align="center">
                <Swatch color="red" />
                <Text size="small">Fail</Text>
              </Row>
              <Row gap={8} align="center">
                <Swatch color="gray" />
                <Text size="small">Skip</Text>
              </Row>
            </Stack>
          </Row>
        </Stack>
      ) : null}

      {report.pillar_scores.length > 0 ? (
        <Stack gap={12}>
          <H2>Category breakdown</H2>
          <Text size="small" tone="tertiary">
            Remaining counted fails in each pillar: the file to add, and why
            agents care.
          </Text>
          <Grid columns={2} gap={16}>
            {report.pillar_scores.map((pillar) => {
              const fails = countedPillarFails(report, pillar.pillarId);
              return (
                <Card key={pillar.pillarId}>
                  <CardHeader
                    trailing={<Pill size="sm">{`${pillar.percentage}%`}</Pill>}
                  >
                    {pillar.name}
                  </CardHeader>
                  <CardBody>
                    <Stack gap={12}>
                      {pillar.total > 0 ? (
                        <UsageBar
                          total={pillar.total}
                          topLeftLabel={`${pillar.passed} / ${pillar.total}`}
                          segments={[
                            { id: "passed", value: pillar.passed, color: "green" },
                            {
                              id: "failed",
                              value: pillar.total - pillar.passed,
                              color: "red",
                            },
                          ]}
                        />
                      ) : null}
                      {fails.length === 0 ? (
                        <Text size="small" tone="tertiary">
                          No counted gaps.
                        </Text>
                      ) : (
                        fails.map((row) => {
                          const file = failOpenPath(row);
                          return (
                            <Stack key={row.criterionId} gap={4}>
                              <Text>
                                <Code>{row.criterionId}</Code>
                                {` — ${file ? `add ${file}` : row.fix || row.message}`}
                              </Text>
                              <Text size="small" tone="tertiary">
                                {`Why agents care: ${whyForAgents(row.criterionId)}`}
                              </Text>
                            </Stack>
                          );
                        })
                      )}
                    </Stack>
                  </CardBody>
                </Card>
              );
            })}
          </Grid>
        </Stack>
      ) : null}

      <Stack gap={8}>
        <H2>Sequential gate</H2>
        <SequentialGateDag current={band.level} />
        <Text size="small" tone="tertiary">
          L1 to L5 walk. Highlighted node is the current band. The canvas does
          not recompute the 80% gate.
        </Text>
      </Stack>

      {report.pillar_scores.length > 0 ? (
        <Stack gap={8}>
          <H2>Pillar scores</H2>
          <LineChart
            categories={report.pillar_scores.map((pillar) => pillar.name)}
            series={[
              {
                name: "Pillar score",
                data: report.pillar_scores.map((pillar) => pillar.percentage),
                tone: scoreChartTone(band.scorePercent),
              },
            ]}
            yMax={100}
            valueSuffix="%"
            referenceLines={[{ value: 80, label: "80%", tone: "warning" }]}
            height={280}
          />
          <Text size="small" tone="tertiary">
            Dashed line is the 80% gate for the current level's non-skipped
            checks. Local filesystem heuristics on the repository root only.
            v1 never runs AI. Not /doctor.
          </Text>
        </Stack>
      ) : null}

      <Stack gap={8}>
        <H2>Remaining to next level</H2>
        <BarChart
          categories={LEVELS.map((item) => `L${item.level}`)}
          series={[
            {
              name: "Remaining fails",
              data: remainingByLevel,
              tone: "danger",
            },
          ]}
          horizontal
          height={220}
        />
        <Text size="small" tone="tertiary">
          Failing counted checks left at each sequential gate
          {band.nextLevel == null || band.nextLevelLabel == null
            ? "."
            : `. Would be ${band.nextLevelLabel}${
                gateRows.length > 0
                  ? ` except ${joinIds(gateRows.map((row) => row.criterionId))}`
                  : ""
              }.`}
        </Text>
      </Stack>

      <Divider />

      <Stack gap={12}>
        <Row gap={12} align="center" wrap>
          <H2>Checks</H2>
          <Spacer />
          <TextInput
            value={failSearch}
            onChange={setFailSearch}
            placeholder="Search failing checks"
            type="search"
          />
          <Text size="small">Fails only</Text>
          <Toggle checked={failsOnly} onChange={setFailsOnly} />
          <Checkbox
            checked={l1CappedOnly}
            onChange={setL1CappedOnly}
            label="L1-capped only"
          />
          <Select
            value={pillarFilter}
            onChange={setPillarFilter}
            options={pillarOptions}
          />
        </Row>
        <H3>{checksHeading}</H3>
        {tableGroups.map((group, index) => (
          <CollapsibleSection
            key={group.pillarId}
            title={group.name}
            count={group.rows.length}
            trailing={<Pill size="sm">{`${group.percentage}%`}</Pill>}
            defaultOpen={index === 0}
          >
            <Table
              headers={["Check", "Id", "Level", "Gap", "Fix"]}
              rows={group.rows.map((row) => [
                row.name,
                <Code>{row.criterionId}</Code>,
                row.level != null ? (
                  <Pill size="sm">{`L${row.level}`}</Pill>
                ) : (
                  ""
                ),
                row.message,
                row.fix || row.details || row.message,
              ])}
              rowTone={group.rows.map(rowTone)}
              striped
            />
          </CollapsibleSection>
        ))}
      </Stack>
    </Stack>
  );
}
