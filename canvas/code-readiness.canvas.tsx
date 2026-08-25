import {
  BarChart,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
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
  TodoListCard,
  Toggle,
  UsageBar,
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

function rowTone(row: CriterionRow): TableRowTone {
  if (row.skipped) return "neutral";
  return row.pass ? "success" : "danger";
}

export default function CodeReadinessCanvas() {
  const theme = useHostTheme();
  const dispatch = useCanvasAction();
  const [report] = useCanvasState<Report | null>("report", null);
  const [pillarFilter, setPillarFilter] = useCanvasState("pillarFilter", "all");
  const [failsOnly, setFailsOnly] = useCanvasState("failsOnly", true);
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
  const sha = report.repo_identity.gitSha
    ? report.repo_identity.gitSha.slice(0, 12)
    : "no git sha";
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
  const visibleRows = report.criterion_results.filter((row) => {
    if (pillarFilter !== "all" && row.pillarId !== pillarFilter) return false;
    if (failsOnly) return !row.pass && !row.skipped;
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
          ) : null}
        </Stack>
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
          <BarChart
            categories={report.pillar_scores.map((pillar) => pillar.name)}
            series={[
              {
                name: "Pillar score",
                data: report.pillar_scores.map((pillar) => pillar.percentage),
                tone: scoreChartTone(band.scorePercent),
              },
            ]}
            horizontal
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

      <Divider />

      <Stack gap={12}>
        <Row gap={12} align="center">
          <H2>Checks</H2>
          <Spacer />
          <Text size="small">Fails only</Text>
          <Toggle checked={failsOnly} onChange={setFailsOnly} />
          <Select
            value={pillarFilter}
            onChange={setPillarFilter}
            options={pillarOptions}
          />
        </Row>
        <H3>{failsOnly ? "Failing checks" : "All checks"}</H3>
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
