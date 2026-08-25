import {
  BarChart,
  Callout,
  CollapsibleSection,
  Divider,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  TodoListCard,
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

function failingByPillar(report: Report) {
  const fails = report.criterion_results.filter((row) => !row.pass && !row.skipped);
  const groups: Array<{
    pillarId: string;
    name: string;
    percentage: number;
    rows: CriterionRow[];
  }> = [];
  for (const score of report.pillar_scores) {
    const rows = fails.filter((row) => row.pillarId === score.pillarId);
    if (rows.length === 0) continue;
    groups.push({
      pillarId: score.pillarId,
      name: score.name,
      percentage: score.percentage,
      rows,
    });
  }
  return groups;
}

function pillarChartTone(level: number): ChartTone {
  return level <= 1 ? "neutral" : "warning";
}

export default function CodeReadinessCanvas() {
  const theme = useHostTheme();
  const [report] = useCanvasState<Report | null>("report", null);
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

  const todos: TodoItem[] = report.remediations.map((item) => ({
    id: item.id,
    content: `${item.title}. ${item.description}`,
    status: "pending",
  }));
  const failGroups = failingByPillar(report);
  const band = report.maturity_level;
  const meta = report.run_metadata;
  const sha = report.repo_identity.gitSha
    ? report.repo_identity.gitSha.slice(0, 12)
    : "no git sha";
  const nextGap =
    band.nextLevel == null
      ? null
      : `Need ${band.nextLevelRemaining} more Level ${band.nextLevel} ${band.nextLevelLabel} checks to move the needle. Have ${band.nextLevelCurrent}, need ${band.nextLevelNeeded}. Sequential 80% gate. Skipped AI checks are excluded from the denominator.`;
  const gapCallout = report.level5Disclaimer
    ? {
        title: "Level 5 is not Autonomous here",
        body: report.level5Disclaimer,
      }
    : nextGap
      ? { title: "Next-level gap", body: nextGap }
      : null;

  return (
    <Stack gap={24} style={pageStyle}>
      <Stack gap={12}>
        <Row gap={8} align="center">
          <Text size="small" tone="tertiary" weight="semibold">
            /CODE-READINESS
          </Text>
          <Pill size="sm">not /doctor</Pill>
        </Row>
        <H1>{report.repo_identity.name}</H1>
        <Row gap={24} align="center">
          <Stat value={`Level ${band.level}`} label={band.label} />
          <Stat
            value={`${band.scorePercent}%`}
            label="Counted checks"
            tone={band.scorePercent >= 80 ? "success" : undefined}
          />
        </Row>
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

      {todos.length > 0 ? (
        <Stack gap={12}>
          <H2>Fix these first</H2>
          <TodoListCard todos={todos} defaultExpanded />
        </Stack>
      ) : null}

      {gapCallout ? (
        <Callout tone="warning" title={gapCallout.title}>
          {gapCallout.body}
        </Callout>
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
                tone: pillarChartTone(band.level),
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

      {failGroups.length > 0 ? (
        <Stack gap={16}>
          <Divider />
          <H3>Failing checks</H3>
          {failGroups.map((group, index) => (
            <CollapsibleSection
              title={group.name}
              count={group.rows.length}
              trailing={<Pill size="sm">{`${group.percentage}%`}</Pill>}
              defaultOpen={index === 0}
            >
              <Table
                headers={["Check", "Gap", "Fix"]}
                rows={group.rows.map((row) => [
                  row.name,
                  row.message,
                  row.fix || row.details || row.message,
                ])}
                rowTone={group.rows.map((): TableRowTone => "danger")}
                striped
              />
            </CollapsibleSection>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
