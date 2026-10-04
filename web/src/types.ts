export interface MemoryTrailItem {
  id: string;
  incident_id: string;
  service: string;
  matched_on: string;
  outcome: string;
  influenced: string[];
  raw_text?: string;
  matches?: number;
  successes?: number;
}

export interface MetricHistoryPoint {
  time_offset: number;
  p95_ms: number;
  error_rate: number;
  action: string;
  outcome?: string;
}

export interface ConfidenceBreakdown {
  final_confidence: number;
  final_confidence_pct: number;
  model_confidence: number;
  model_confidence_pct: number;
  history_score: number;
  history_score_pct: number;
  matches: number;
  successes: number;
  formula: string;
  explanation: string;
}

export interface RootCauseAnalysis {
  root_cause: string;
  title: string;
  severity: string;
  category: string;
  explanation: string;
  evidence: string[];
  impact: string;
}

export interface ActionableRecommendation {
  action: string;
  priority: number;
  risk: "low" | "medium" | "high";
  rationale: string;
  expected_minutes: number;
  is_proven_fix: boolean;
  avoid_reason?: string;
}

export interface AgentReasoningStep {
  agent: string;
  stage: string;
  thought: string;
  evidence?: string[];
  confidence?: number;
}

export interface MemoryCorrelation {
  source_incident_id: string;
  source_service: string;
  target_service: string;
  shared_root_cause: string;
  similarity_pct: number;
  correlation_factors: string[];
  transferred_learnings: string;
  outcome_summary?: string;
}

export interface IncidentRun {
  id: string;
  incident_id: string;
  label: string;
  service: string;
  severity: string;
  category: string;
  status: string;
  current_stage?: string;
  root_cause?: string;
  minutes: number;
  memory_on: boolean;
  memory_degraded?: boolean;
  escalated: boolean;
  escalation_reason?: string;
  needs_human?: string[];
  tried: string[];
  succeeded: string[];
  failed: string[];
  worsened: string[];
  confidence: number;
  confidence_breakdown?: ConfidenceBreakdown;
  memory_trail: MemoryTrailItem[];
  diagnosis?: {
    root_cause?: string;
    explanation?: string;
    confidence?: number;
    evidence?: string[];
  };
  root_cause_analysis?: RootCauseAnalysis | null;
  actionable_recommendations?: ActionableRecommendation[];
  agent_reasoning?: AgentReasoningStep[];
  memory_correlation?: MemoryCorrelation | null;
  exec_log: Array<{
    action: string;
    minutes?: number;
    outcome?: string;
    verdict?: string;
    metrics?: { p95_ms: number; error_rate: number };
  }>;
  log_lines: string[];
  metric_history: MetricHistoryPoint[];
  postmortem?: string;
  reflection?: string;
  created_at?: string;
  run_id?: number;
}

export interface Incident {
  id: string;
  service: string;
  severity: string;
  category: string;
  root_cause: string;
  description: string;
  tag: string;
  status: string;
  minutes: number;
  memory_on: boolean | null;
  latest_run?: IncidentRun | null;
}

export interface Playbook {
  root_cause: string;
  recommended_action: string;
  avoid_action: string;
  synthesis: string;
  updated_at: string;
}

export interface SystemStats {
  baseline_avg_minutes: number;
  memory_avg_minutes: number;
  time_saved_pct: number;
  baseline_avg_actions: number;
  memory_avg_actions: number;
  actions_reduced_pct: number;
  total_baseline_runs: number;
  total_memory_runs: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded";
  llm_provider: string;
  llm_model: string;
  llm_configured: boolean;
  groq_configured: boolean;
  hindsight_configured: boolean;
  hindsight_bank: string;
  hindsight_url: string;
  memory_degraded: boolean;
  containerized?: boolean;
  runtime?: string;
  container_engine?: string;
  container_isolation?: string;
  container_volumes?: string[];
}

