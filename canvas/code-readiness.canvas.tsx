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
  { level: 1, label: "Foundational" },
  { level: 2, label: "Guided" },
  { level: 3, label: "Structured" },
  { level: 4, label: "Optimized" },
  { level: 5, label: "Autonomous" },
];

const OPEN_BY_ID: Record<string, string> = {
  editorconfig: ".editorconfig",
  readme: "README.md",
  license: "LICENSE",
  contributing: "CONTRIBUTING.md",
  "env-documentation": ".env.example",
  "ai-context": "CLAUDE.md",
  codeowners: "CODEOWNERS",
  "security-policy": "SECURITY.md",
};

const CONCRETE_PATHS = [
  ".github/CODEOWNERS",
  ".pre-commit-config.yaml",
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
];

const DAG_NODE_WIDTH = 88;
const DAG_NODE_HEIGHT = 40;

function scoreChartTone(percent: number): ChartTone {
  if (percent >= 80) return "success";
  if (percent >= 50) return "warning";
  return "danger";
}

function namedOpenPath(item: Remediation): string | null {
  const mapped = OPEN_BY_ID[item.criterionId];
  if (mapped) return mapped;
  const blob = `${item.title} ${item.description} ${item.reason}`;
  return CONCRETE_PATHS.find((file) => blob.includes(file)) ?? null;
}

function failOpenPath(row: CriterionRow): string | null {
  const mapped = OPEN_BY_ID[row.criterionId];
  if (mapped) return mapped;
  const blob = `${row.name} ${row.message} ${row.fix ?? ""} ${row.details ?? ""}`;
  return CONCRETE_PATHS.find((file) => blob.includes(file)) ?? null;
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
  const todos: TodoItem[] = report.remediations.map((item) => ({
    id: item.id,
    content: `${item.title}. ${item.description}`,
    status: "pending",
  }));
  const openable = report.remediations
    .map((item) => ({ item, path: namedOpenPath(item) }))
    .filter((entry): entry is { item: Remediation; path: string } => entry.path != null);
  const topFailPath =
    report.criterion_results
      .filter((row) => !row.pass && !row.skipped)
      .map(failOpenPath)
      .find((file) => file != null) ?? null;
  const sha = report.repo_identity.gitSha
    ? report.repo_identity.gitSha.slice(0, 12)
    : "no git sha";
  const repoHref = identityUrl(report.repo_identity);
  const nextGap =
    band.nextLevel == null
      ? null
      : `Need ${band.nextLevelRemaining} more Level ${band.nextLevel} ${band.nextLevelLabel} checks to move the needle. Have ${band.nextLevelCurrent}, need ${band.nextLevelNeeded}. Sequential 80% gate. Skipped AI checks are excluded from the denominator.`;
  const gapCallout = band.l1Capped
    ? {
        title: "L1 capped",
        body: `Passed the L2 gate (${band.l2Passed}/${band.l2Total}) but stuck on ${band.l1CapReasons.join(", ")}. Sequential 80% gate. This cap is why the band stays Foundational.`,
      }
    : report.level5Disclaimer
      ? {
          title: "Level 5 is not Autonomous here",
          body: report.level5Disclaimer,
        }
      : nextGap
        ? { title: "Next-level gap", body: nextGap }
        : null;
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

      <Stack gap={8}>
        <H2>Sequential gate</H2>
        <SequentialGateDag current={band.level} />
        <Text size="small" tone="tertiary">
          L1 to L5 walk. Highlighted node is the current band. The canvas does
          not recompute the 80% gate.
        </Text>
      </Stack>

      {todos.length > 0 ? (
        <Stack gap={12}>
          <H2>Fix these first</H2>
          <TodoListCard todos={todos} defaultExpanded />
          {openable.length > 0 ? (
            <Row gap={8} wrap>
              {openable.map((entry) => (
                <Button
                  key={entry.item.id}
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
          <H2>Pillars</H2>
          <Grid columns={2} gap={16}>
            {report.pillar_scores.map((pillar) => (
              <Card key={pillar.pillarId}>
                <CardHeader>{pillar.name}</CardHeader>
                <CardBody>
                  <Stack gap={8}>
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
                    ) : (
                      <Text size="small" tone="tertiary">
                        No counted checks
                      </Text>
                    )}
                    <Text size="small" tone="tertiary">
                      {`${pillar.percentage}%`}
                    </Text>
                  </Stack>
                </CardBody>
              </Card>
            ))}
          </Grid>
        </Stack>
      ) : null}

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
          {band.nextLevel == null
            ? "."
            : `. Need ${band.nextLevelRemaining} more Level ${band.nextLevel} ${band.nextLevelLabel} checks to move the needle.`}
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
