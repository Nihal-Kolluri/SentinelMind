import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { IncidentFeed } from './components/IncidentFeed';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { RootCauseCard } from './components/RootCauseCard';
import { ActionTabs } from './components/ActionTabs';
import { MemoryCorrelationCard } from './components/MemoryCorrelationCard';
import { MemoryTrailView } from './components/MemoryTrailView';
import { ConfidenceGauge } from './components/ConfidenceGauge';
import { MetricsChart } from './components/MetricsChart';
import { WhatIfSlider } from './components/WhatIfSlider';
import { MemoryImpactView } from './components/MemoryImpactView';
import { IncidentHistoryView } from './components/IncidentHistoryView';
import { LandingHero } from './components/LandingHero';
import { DynamicIncidentModal } from './components/DynamicIncidentModal';
import {
  fetchIncidents,
  fetchIncident,
  triggerRun,
  fetchPlaybooks,
  fetchStats,
  fetchHealth,
  resetDemo,
  seedDemo,
  killExecution,
  subscribeIncidentStream,
} from './api';
import { HealthStatus, Incident, IncidentRun, Playbook, SystemStats } from './types';

// Default mock scenarios matching sentinelmind-console.html
const DEFAULT_SCENARIOS: Incident[] = [
  { id: 'INC-104', service: 'orders-api', severity: 'P1', category: 'performance', root_cause: 'db_pool_exhaustion', description: 'p95 4700 ms, 9% errors', tag: 'Memory', status: 'resolved', minutes: 5, memory_on: true },
  { id: 'INC-103', service: 'checkout-api', severity: 'P1', category: 'performance', root_cause: 'db_pool_exhaustion', description: 'p95 5200 ms, 12% errors', tag: 'Learning', status: 'resolved', minutes: 21, memory_on: false },
  { id: 'INC-102', service: 'catalog-service', severity: 'P2', category: 'performance', root_cause: 'cache_stampede', description: 'p95 3600 ms, 4.7% errors', tag: 'Memory', status: 'resolved', minutes: 6, memory_on: true },
  { id: 'INC-101', service: 'payments-api', severity: 'P2', category: 'performance', root_cause: 'cache_stampede', description: 'p95 4200 ms, 6.1% errors', tag: 'Learning', status: 'resolved', minutes: 17, memory_on: false },
  { id: 'INC-108', service: 'billing-service', severity: 'P1', category: 'data', root_cause: 'database_lock_contention', description: 'deadlock detected on accounts_ledger', tag: 'Escalation', status: 'escalated', minutes: 8, memory_on: true },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'warroom' | 'impact' | 'history' | 'overview'>('warroom');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [incidents, setIncidents] = useState<Incident[]>(DEFAULT_SCENARIOS);
  const [curId, setCurId] = useState<string>('INC-102');
  const [memMode, setMemMode] = useState<boolean>(true);
  const [currentRun, setCurrentRun] = useState<IncidentRun | null>(null);
  const [currentStage, setCurrentStage] = useState<string>('historian');
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((c) => (c === msg ? null : c)), 4000);
  };

  const handleIncidentCreated = (newIncident: Incident, runState?: IncidentRun) => {
    setIncidents((prev) => [newIncident, ...prev.filter((i) => i.id !== newIncident.id)]);
    setCurId(newIncident.id);
    if (runState) {
      setCurrentRun(runState);
      setAgentLogs(runState.log_lines || []);
      setCurrentStage(runState.status === 'resolved' ? 'historian' : runState.status);
      setMemMode(runState.memory_on);
    }
    showToast(`✓ Dynamic incident ${newIncident.id} (${newIncident.service}) analyzed & stored!`);
    fetchStats().then((s) => s && setStats(s)).catch(() => {});
    fetchPlaybooks().then((p) => p && setPlaybooks(p)).catch(() => {});
    fetchHealth().then((h) => h && setHealth(h)).catch(() => {});
  };

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [incData, healthData, statsData, pbData] = await Promise.all([
        fetchIncidents().catch(() => DEFAULT_SCENARIOS),
        fetchHealth().catch(() => null),
        fetchStats().catch(() => null),
        fetchPlaybooks().catch(() => []),
      ]);
      if (incData && incData.length > 0) {
        setIncidents((prev) => {
          const map = new Map<string, Incident>();
          incData.forEach((inc) => map.set(inc.id, inc));
          prev.forEach((inc) => {
            if (!map.has(inc.id)) {
              map.set(inc.id, inc);
            }
          });
          return Array.from(map.values());
        });
      }
      if (healthData) setHealth(healthData);
      if (statsData) setStats(statsData);
      if (pbData) setPlaybooks(pbData);
    } catch (e) {
      console.warn('Initial data load fallback:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load selected incident details
  const loadSelectedIncident = useCallback(async (id: string) => {
    try {
      const data = await fetchIncident(id);
      if (data && data.latest_run) {
        setCurrentRun(data.latest_run);
        setAgentLogs(data.latest_run.log_lines || []);
        setCurrentStage(data.latest_run.status === 'resolved' ? 'historian' : data.latest_run.status);
      } else if (data && data.scenario) {
        simulateIncidentDisplay(id, memMode, data.scenario);
      } else {
        simulateIncidentDisplay(id, memMode);
      }
    } catch {
      simulateIncidentDisplay(id, memMode);
    }
  }, [memMode]);

  useEffect(() => {
    loadSelectedIncident(curId);
  }, [curId, loadSelectedIncident]);

  const simulateIncidentDisplay = (id: string, withMem: boolean, customScenario?: any) => {
    if (id === 'INC-102') {
      const isWarm = withMem;
      setCurrentRun({
        id: 'INC-102',
        incident_id: 'INC-102',
        label: isWarm ? 'with_memory' : 'baseline',
        service: 'catalog-service',
        severity: 'P2',
        category: 'performance',
        status: 'resolved',
        minutes: isWarm ? 6 : 17,
        memory_on: isWarm,
        escalated: false,
        tried: isWarm ? ['enable_request_coalescing'] : ['restart_pods', 'scale_out', 'enable_request_coalescing'],
        succeeded: ['enable_request_coalescing'],
        failed: isWarm ? [] : ['restart_pods', 'scale_out'],
        worsened: [],
        confidence: isWarm ? 0.88 : 0.60,
        confidence_breakdown: {
          final_confidence: isWarm ? 0.88 : 0.60,
          final_confidence_pct: isWarm ? 88.0 : 60.0,
          model_confidence: isWarm ? 0.93 : 0.70,
          model_confidence_pct: isWarm ? 93.0 : 70.0,
          history_score: isWarm ? 0.67 : 0.50,
          history_score_pct: isWarm ? 66.7 : 50.0,
          matches: isWarm ? 1 : 0,
          successes: isWarm ? 1 : 0,
          formula: '0.5 * model_confidence + 0.5 * ((successes + 1) / (matches + 2))',
          explanation: isWarm
            ? 'Blend of model confidence (93%) and history-based success rate (67%, 1 of 1 similar past fixes).'
            : 'Blend of model confidence (70%) and history-based success rate (50%, 0 of 0 similar past fixes).',
        },
        root_cause_analysis: {
          root_cause: 'cache_stampede',
          title: 'Cache Stampede',
          severity: 'P2',
          category: 'performance',
          explanation: 'Simultaneous expiration of high-traffic cached product items caused mass cache misses, flooding backend databases with redundant queries.',
          evidence: ['cache_hit_ratio: 0.12 (baseline 0.94)', 'redis_p99_latency: 840ms', 'db_active_threads: 48'],
          impact: 'catalog-service latency spiked to 3,600ms; customer browse experience severely degraded.',
        },
        actionable_recommendations: [
          {
            action: 'enable_request_coalescing',
            priority: 1,
            risk: 'low',
            rationale: isWarm
              ? 'Proven resolution pattern recalled from memory for cache_stampede (verified in INC-101).'
              : 'Standard recommended mitigation for cache stampede.',
            expected_minutes: 2,
            is_proven_fix: isWarm,
          },
          {
            action: 'restart_pods',
            priority: 2,
            risk: 'low',
            rationale: 'Generic service restart (ineffective for cache-layer stampedes).',
            expected_minutes: 3,
            is_proven_fix: false,
          },
          {
            action: 'flush_cache',
            priority: 99,
            risk: 'high',
            rationale: 'DO NOT RUN: Discards remaining warm cache keys, catastrophically increasing stampede pressure.',
            expected_minutes: 0,
            is_proven_fix: false,
            avoid_reason: 'Discards remaining warm cache keys, catastrophically increasing stampede pressure.',
          },
        ],
        agent_reasoning: [
          {
            agent: 'Sentinel',
            stage: 'detection',
            thought: 'Ingested telemetry from catalog-service. Deduplicated 2 alerts (high p99 latency & low cache hit ratio) into single incident.',
            evidence: ['latency_p99_high', 'cache_hit_ratio_drop'],
          },
          {
            agent: 'Triage',
            stage: 'classification',
            thought: isWarm
              ? 'Assessed as P2 (performance). Memory retrieval found direct match with INC-101 (payments-api). Prioritizing known playbook.'
              : 'Assessed as P2 (performance). No prior memory matches found; treating as novel incident.',
            confidence: isWarm ? 0.92 : 0.65,
          },
          {
            agent: 'Investigator',
            stage: 'investigation',
            thought: 'Diagnosed root cause as cache_stampede. Telemetry reveals mass key expiration with simultaneous redundant DB lookups.',
            evidence: ['cache_hit_ratio: 0.12', 'db_active_threads: 48'],
            confidence: isWarm ? 0.88 : 0.60,
          },
          {
            agent: 'Planner',
            stage: 'planning',
            thought: isWarm
              ? 'Leveraged Hindsight memory: skipped ineffective restarts/scale-outs and selected enable_request_coalescing directly.'
              : 'No memory priors: scheduled standard trial-and-error escalation starting with restart_pods.',
            evidence: isWarm ? ['enable_request_coalescing'] : ['restart_pods', 'scale_out', 'enable_request_coalescing'],
          },
          {
            agent: 'Verifier',
            stage: 'verification',
            thought: 'Confirmed catalog-service telemetry returned to SLA healthy baseline across 3-minute stabilization window.',
          },
          {
            agent: 'Historian',
            stage: 'retention',
            thought: 'Committed incident postmortem and lessons learned to Hindsight memory bank for cross-service recall.',
            evidence: ['enable_request_coalescing succeeded in 6 minutes'],
          },
        ],
        memory_correlation: isWarm
          ? {
              source_incident_id: 'INC-101',
              source_service: 'payments-api',
              target_service: 'catalog-service',
              shared_root_cause: 'cache_stampede',
              similarity_pct: 94,
              correlation_factors: [
                'Symptom signature overlap: cache miss surge and backend DB query saturation',
                'Common caching topology: Redis key expiry cascade under load',
                'Proven mitigation: enable_request_coalescing prevents thundering herd',
              ],
              transferred_learnings: 'Reused successful request coalescing mitigation from INC-101 (payments-api) to resolve catalog-service in 6 min instead of 17 min.',
              outcome_summary: 'enable_request_coalescing fixed it. restart_pods and scale_out did not.',
            }
          : null,
        memory_trail: isWarm
          ? [
              {
                id: 'INC-101',
                incident_id: 'INC-101',
                service: 'payments-api',
                matched_on: 'cache MISS spike after TTL cut, mass key expiry',
                outcome: 'enable_request_coalescing fixed it. restart_pods and scale_out did not.',
                influenced: ['Triage', 'Investigator', 'Planner'],
                matches: 1,
                successes: 1,
              },
            ]
          : [],
        exec_log: isWarm
          ? [{ action: 'enable_request_coalescing', outcome: 'effective' }]
          : [
              { action: 'restart_pods', outcome: 'no_effect' },
              { action: 'scale_out', outcome: 'no_effect' },
              { action: 'enable_request_coalescing', outcome: 'effective' },
            ],
        log_lines: isWarm
          ? [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> recalled INC-101: known pattern',
              '<em>Investigator</em> root cause: cache_stampede',
              '<em>Planner</em> skipped known dead ends, first pick enable_request_coalescing',
              '<em>Executor</em> ran enable_request_coalescing',
              '<em>Verifier</em> metrics healthy for 3 min',
              '<em>Historian</em> retained postmortem to Hindsight',
            ]
          : [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> found no similar past incident: novel',
              '<em>Investigator</em> root cause: cache_stampede',
              '<em>Planner</em> no history, trying generic fixes first: restart_pods',
              '<em>Executor</em> ran restart_pods, scale_out, enable_request_coalescing',
              '<em>Verifier</em> metrics healthy for 3 min',
              '<em>Historian</em> retained postmortem to Hindsight',
            ],
        metric_history: [],
      });
      setAgentLogs(
        isWarm
          ? [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> recalled INC-101: known pattern',
              '<em>Investigator</em> root cause: cache_stampede',
              '<em>Planner</em> skipped known dead ends, first pick enable_request_coalescing',
              '<em>Executor</em> ran enable_request_coalescing',
              '<em>Verifier</em> metrics healthy for 3 min',
              '<em>Historian</em> retained postmortem to Hindsight',
            ]
          : [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> found no similar past incident: novel',
              '<em>Investigator</em> root cause: cache_stampede',
              '<em>Planner</em> no history, trying generic fixes first: restart_pods',
              '<em>Executor</em> ran restart_pods, scale_out, enable_request_coalescing',
              '<em>Verifier</em> metrics healthy for 3 min',
              '<em>Historian</em> retained postmortem to Hindsight',
            ]
      );
      setCurrentStage('historian');
    } else if (id === 'INC-104') {
      const isWarm = withMem;
      setCurrentRun({
        id: 'INC-104',
        incident_id: 'INC-104',
        label: isWarm ? 'with_memory' : 'baseline',
        service: 'orders-api',
        severity: 'P1',
        category: 'performance',
        status: 'resolved',
        minutes: isWarm ? 5 : 21,
        memory_on: isWarm,
        escalated: false,
        tried: isWarm ? ['increase_db_pool'] : ['restart_pods', 'scale_out', 'increase_db_pool'],
        succeeded: ['increase_db_pool'],
        failed: isWarm ? [] : ['restart_pods'],
        worsened: isWarm ? [] : ['scale_out'],
        confidence: isWarm ? 0.90 : 0.60,
        confidence_breakdown: {
          final_confidence: isWarm ? 0.90 : 0.60,
          final_confidence_pct: isWarm ? 90.0 : 60.0,
          model_confidence: isWarm ? 0.94 : 0.70,
          model_confidence_pct: isWarm ? 94.0 : 70.0,
          history_score: isWarm ? 0.67 : 0.50,
          history_score_pct: isWarm ? 66.7 : 50.0,
          matches: isWarm ? 1 : 0,
          successes: isWarm ? 1 : 0,
          formula: '0.5 * model_confidence + 0.5 * ((successes + 1) / (matches + 2))',
          explanation: isWarm
            ? 'Blend of model confidence (94%) and history-based success rate (67%, 1 of 1 similar past fixes).'
            : 'Blend of model confidence (70%) and history-based success rate (50%, 0 of 0 similar past fixes).',
        },
        root_cause_analysis: {
          root_cause: 'db_pool_exhaustion',
          title: 'DB Connection Pool Exhaustion',
          severity: 'P1',
          category: 'performance',
          explanation: 'Connection starvation on primary database cluster caused by unreleased connections during high query concurrency.',
          evidence: ['db_pool_active: 100/100', 'connection_wait_ms > 2500ms', 'error_rate: 18%'],
          impact: 'orders-api transaction timeouts; critical checkout failures.',
        },
        actionable_recommendations: [
          {
            action: 'increase_db_pool',
            priority: 1,
            risk: 'low',
            rationale: isWarm
              ? 'Proven resolution pattern recalled from INC-103 for db_pool_exhaustion.'
              : 'Standard remediation for connection starvation.',
            expected_minutes: 2,
            is_proven_fix: isWarm,
          },
          {
            action: 'scale_out',
            priority: 99,
            risk: 'high',
            rationale: 'DO NOT RUN: Adds more worker connections, worsening database connection starvation.',
            expected_minutes: 0,
            is_proven_fix: false,
            avoid_reason: 'Adds more worker connections, worsening database connection starvation.',
          },
        ],
        agent_reasoning: [
          {
            agent: 'Sentinel',
            stage: 'detection',
            thought: 'Ingested telemetry from orders-api. Deduplicated alerts: connection timeout & transaction failure rate.',
            evidence: ['db_connection_timeout', 'http_500_rate_high'],
          },
          {
            agent: 'Triage',
            stage: 'classification',
            thought: isWarm
              ? 'Classified as P1 (critical). Direct match with INC-103 (checkout-api). Avoid harmful scaling.'
              : 'Classified as P1 (critical). Novel incident.',
            confidence: isWarm ? 0.95 : 0.65,
          },
          {
            agent: 'Investigator',
            stage: 'investigation',
            thought: 'Identified root cause: db_pool_exhaustion. Connections saturated at 100/100.',
            evidence: ['db_pool_active: 100/100', 'connection_wait_ms: 2800ms'],
            confidence: isWarm ? 0.90 : 0.60,
          },
          {
            agent: 'Planner',
            stage: 'planning',
            thought: isWarm
              ? 'Memory alerted: scale_out previously worsened db_pool_exhaustion. Prioritizing increase_db_pool.'
              : 'Scheduled trial actions: restart_pods, scale_out.',
            evidence: isWarm ? ['increase_db_pool'] : ['restart_pods', 'scale_out', 'increase_db_pool'],
          },
          {
            agent: 'Verifier',
            stage: 'verification',
            thought: isWarm
              ? 'Confirmed db connections normalized (32/150) and latency dropped to baseline.'
              : 'Detected worsening when scale_out was attempted! Auto-rolled back and froze plan.',
          },
          {
            agent: 'Historian',
            stage: 'retention',
            thought: 'Recorded postmortem into Hindsight: increase_db_pool is verified fix; scale_out must be avoided.',
            evidence: ['increase_db_pool succeeded in 5 minutes'],
          },
        ],
        memory_correlation: isWarm
          ? {
              source_incident_id: 'INC-103',
              source_service: 'checkout-api',
              target_service: 'orders-api',
              shared_root_cause: 'db_pool_exhaustion',
              similarity_pct: 96,
              correlation_factors: [
                'Symptom signature overlap: connection timeout cascade and connection pool saturation',
                'Common failure topology: Postgres shared connection ceiling',
                'Harmful action avoidance: scale_out warned as worsening connection starvation',
              ],
              transferred_learnings: 'Transferred fix and anti-pattern knowledge from checkout-api to orders-api, resolving in 5 min instead of 21 min.',
              outcome_summary: 'increase_db_pool fixed it. scale_out made it worse and was rolled back.',
            }
          : null,
        memory_trail: isWarm
          ? [
              {
                id: 'INC-103',
                incident_id: 'INC-103',
                service: 'checkout-api',
                matched_on: 'DB pool exhausted, connections at max',
                outcome: 'increase_db_pool fixed it. scale_out made it worse and was rolled back.',
                influenced: ['Triage', 'Investigator', 'Planner'],
                matches: 1,
                successes: 1,
              },
            ]
          : [],
        exec_log: [],
        log_lines: isWarm
          ? [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> recalled INC-103: known pattern (db_pool_exhaustion)',
              '<em>Investigator</em> root cause: db_pool_exhaustion',
              '<em>Planner</em> avoided harmful scale_out, first pick increase_db_pool',
              '<em>Executor</em> ran increase_db_pool',
              '<em>Verifier</em> metrics healthy for 3 min',
              '<em>Historian</em> retained postmortem to Hindsight',
            ]
          : [
              '<em>Sentinel</em> deduped 2 alerts into 1 incident',
              '<em>Triage</em> found no similar past incident: novel',
              '<em>Investigator</em> root cause: db_pool_exhaustion',
              '<em>Planner</em> scheduled restart_pods, scale_out',
              '<em>Executor</em> ran scale_out',
              '<em>Verifier</em> detected worsening -> rolled back, freezing plan',
              '<em>Planner</em> replanning without bad action: scheduled increase_db_pool',
              '<em>Executor</em> ran increase_db_pool',
              '<em>Verifier</em> metrics healthy',
            ],
        metric_history: [],
      });
      setCurrentStage('historian');
    } else {
      const inc = customScenario
        ? {
            id,
            service: customScenario.service || 'custom-service',
            severity: customScenario.severity || 'P2',
            category: customScenario.category || 'performance',
            root_cause: customScenario.root_cause || 'service_degradation',
            description: customScenario.description || 'Observed anomalous service telemetry',
            tag: customScenario.tag || 'Dynamic',
          }
        : incidents.find((i) => i.id === id) || {
            id,
            service: 'custom-service',
            severity: 'P2',
            category: 'performance',
            root_cause: 'service_degradation',
            description: 'Incident telemetry under investigation',
            tag: 'Dynamic',
          };

      const isWarm = withMem;
      const rc = inc.root_cause || 'service_degradation';
      const rcFormatted = rc.replace(/_/g, ' ');
      const effectiveAction =
        (customScenario?.effective && Array.from(customScenario.effective)[0]) ||
        (rc.includes('cache')
          ? 'enable_request_coalescing'
          : rc.includes('pool')
          ? 'increase_db_pool'
          : rc.includes('lock')
          ? 'failover_db'
          : 'restart_pods');

      const isEscalated = inc.severity === 'P1' && rc.includes('lock');

      const simRun: IncidentRun = {
        id: inc.id,
        incident_id: inc.id,
        label: isWarm ? 'with_memory' : 'baseline',
        service: inc.service,
        severity: inc.severity,
        category: inc.category,
        status: isEscalated ? 'escalated' : 'resolved',
        minutes: isWarm ? 5 : 18,
        memory_on: isWarm,
        escalated: isEscalated,
        escalation_reason: isEscalated ? 'Deadlock on financial ledger requires human approval' : undefined,
        tried: isWarm ? [effectiveAction] : ['restart_pods', 'scale_out', effectiveAction],
        succeeded: isEscalated ? [] : [effectiveAction],
        failed: isWarm ? [] : ['restart_pods'],
        worsened: isWarm ? [] : ['scale_out'],
        confidence: isWarm ? 0.89 : 0.62,
        confidence_breakdown: {
          final_confidence: isWarm ? 0.89 : 0.62,
          final_confidence_pct: isWarm ? 89.0 : 62.0,
          model_confidence: isWarm ? 0.92 : 0.70,
          model_confidence_pct: isWarm ? 92.0 : 70.0,
          history_score: isWarm ? 0.67 : 0.50,
          history_score_pct: isWarm ? 66.7 : 50.0,
          matches: isWarm ? 1 : 0,
          successes: isWarm ? 1 : 0,
          formula: '0.5 * model_confidence + 0.5 * ((successes + 1) / (matches + 2))',
          explanation: isWarm
            ? 'Memory correlation matched historical incident pattern with confirmed resolution.'
            : 'Cold start without prior memory priors: generic heuristic trial mitigations.',
        },
        root_cause_analysis: {
          root_cause: rc,
          title: rcFormatted.toUpperCase(),
          severity: inc.severity,
          category: inc.category,
          explanation: inc.description || `Diagnostic evaluation identified ${rcFormatted} impacting ${inc.service}.`,
          evidence: [
            `${inc.service} latency elevated to p95 > 3500ms`,
            `Error rate spiked above normal baseline`,
            `Signature matched failure pattern for ${rcFormatted}`,
          ],
          impact: `${inc.service} latency and error rate impacted end-user transactions.`,
        },
        actionable_recommendations: [
          {
            action: effectiveAction,
            priority: 1,
            risk: 'low',
            rationale: isWarm
              ? `Proven mitigation recalled from Hindsight memory bank for ${rcFormatted}.`
              : `Recommended targeted remediation for ${rcFormatted}.`,
            expected_minutes: 2,
            is_proven_fix: isWarm,
          },
          {
            action: 'restart_pods',
            priority: 2,
            risk: 'low',
            rationale: 'Generic service pod restart.',
            expected_minutes: 3,
            is_proven_fix: false,
          },
        ],
        agent_reasoning: [
          {
            agent: 'Sentinel',
            stage: 'detection',
            thought: `Ingested telemetry from ${inc.service}. Deduplicated anomalous signals into incident ${inc.id}.`,
            evidence: ['latency_p95_high', 'error_rate_elevated'],
          },
          {
            agent: 'Triage',
            stage: 'classification',
            thought: isWarm
              ? `Assessed severity as ${inc.severity}. Hindsight memory recalled matching incident pattern for ${rcFormatted}.`
              : `Assessed severity as ${inc.severity}. Novel anomaly signature with no prior memory matches.`,
            confidence: isWarm ? 0.91 : 0.64,
          },
          {
            agent: 'Investigator',
            stage: 'investigation',
            thought: `Diagnosed root cause as ${rcFormatted}. Telemetry signature aligns with known degradation behavior.`,
            confidence: isWarm ? 0.89 : 0.62,
          },
          {
            agent: 'Planner',
            stage: 'planning',
            thought: isWarm
              ? `Memory-directed planning: skipped trial-and-error, prioritized ${effectiveAction}.`
              : `Cold planner: scheduled standard trial mitigations starting with restart_pods.`,
          },
          {
            agent: 'Verifier',
            stage: 'verification',
            thought: `Confirmed telemetry returned to SLA healthy baseline after ${effectiveAction}.`,
          },
          {
            agent: 'Historian',
            stage: 'retention',
            thought: `Committed postmortem and resolution playbook for ${rcFormatted} to Hindsight memory.`,
          },
        ],
        memory_correlation: isWarm
          ? {
              source_incident_id: 'INC-101',
              source_service: 'cluster-core',
              target_service: inc.service,
              shared_root_cause: rc,
              similarity_pct: 91,
              correlation_factors: [
                'Symptom signature overlap: latency spike and error rate elevation',
                'Common failure domain and resource saturation pattern',
                `Proven mitigation: ${effectiveAction}`,
              ],
              transferred_learnings: `Transferred proven ${effectiveAction} fix to resolve ${inc.service} in ${isWarm ? 5 : 18} minutes.`,
              outcome_summary: `${effectiveAction} successfully resolved the incident.`,
            }
          : null,
        memory_trail: isWarm
          ? [
              {
                id: 'INC-PRIOR',
                incident_id: 'INC-PRIOR',
                service: 'cluster-core',
                matched_on: `${rcFormatted} degradation pattern`,
                outcome: `${effectiveAction} resolved it.`,
                influenced: ['Triage', 'Investigator', 'Planner'],
                matches: 1,
                successes: 1,
              },
            ]
          : [],
        exec_log: isWarm
          ? [{ action: effectiveAction, outcome: 'effective' }]
          : [
              { action: 'restart_pods', outcome: 'no_effect' },
              { action: 'scale_out', outcome: 'no_effect' },
              { action: effectiveAction, outcome: 'effective' },
            ],
        log_lines: isWarm
          ? [
              `<em>Sentinel</em> deduped alerts for ${inc.service}`,
              `<em>Triage</em> recalled past pattern for ${rcFormatted}`,
              `<em>Investigator</em> diagnosed root cause: ${rcFormatted}`,
              `<em>Planner</em> selected proven fix: ${effectiveAction}`,
              `<em>Executor</em> ran ${effectiveAction}`,
              `<em>Verifier</em> metrics healthy for 3 min`,
              `<em>Historian</em> retained postmortem to Hindsight`,
            ]
          : [
              `<em>Sentinel</em> deduped alerts for ${inc.service}`,
              `<em>Triage</em> no prior memory: novel incident`,
              `<em>Investigator</em> diagnosed root cause: ${rcFormatted}`,
              `<em>Planner</em> testing trial actions`,
              `<em>Executor</em> ran restart_pods, scale_out, ${effectiveAction}`,
              `<em>Verifier</em> metrics healthy for 3 min`,
              `<em>Historian</em> retained postmortem to Hindsight`,
            ],
        metric_history: [],
      };

      setCurrentRun(simRun);
      setAgentLogs(simRun.log_lines);
      setCurrentStage(simRun.status === 'resolved' ? 'historian' : simRun.status);
    }
  };

  // Trigger live incident execution with SSE streaming
  const handleReplay = async () => {
    setIsRunning(true);
    setAgentLogs([]);
    setCurrentStage('detected');

    // Subscribe to SSE stream
    const unsubscribe = subscribeIncidentStream(
      curId,
      (event, data) => {
        if (event === 'stage') {
          setCurrentStage(data.stage);
        } else if (event === 'step_complete') {
          if (data.log_lines) setAgentLogs(data.log_lines);
          if (data.stage) setCurrentStage(data.stage);
          setCurrentRun((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              confidence: data.confidence !== undefined ? data.confidence : prev.confidence,
              confidence_breakdown: data.confidence_breakdown !== undefined ? data.confidence_breakdown : prev.confidence_breakdown,
              root_cause_analysis: data.root_cause_analysis !== undefined ? data.root_cause_analysis : prev.root_cause_analysis,
              actionable_recommendations: data.actionable_recommendations !== undefined ? data.actionable_recommendations : prev.actionable_recommendations,
              agent_reasoning: data.agent_reasoning !== undefined ? data.agent_reasoning : prev.agent_reasoning,
              memory_correlation: data.memory_correlation !== undefined ? data.memory_correlation : prev.memory_correlation,
              memory_trail: data.memory_trail !== undefined ? data.memory_trail : prev.memory_trail,
            };
          });
        } else if (event === 'action_result') {
          setAgentLogs((prev) => [
            ...prev,
            `<em>Executor</em> ran ${data.action} &rarr; <em>Verifier</em>: ${data.verdict}`,
          ]);
        } else if (event === 'complete' || event === 'escalated') {
          setIsRunning(false);
          loadSelectedIncident(curId);
          loadData();
          unsubscribe();
        }
      },
      () => {
        // Fallback animation if server SSE is unavailable
        animateFallbackReplay();
        unsubscribe();
      }
    );

    try {
      await triggerRun(curId, memMode);
    } catch {
      animateFallbackReplay();
    }
  };

  const animateFallbackReplay = () => {
    const isWarm = memMode && currentRun?.memory_trail && currentRun.memory_trail.length > 0;
    const stages = ['Sentinel', 'Triage', 'Investigator', 'Planner', 'Executor', 'Verifier', 'Historian'];
    const logs = isWarm
      ? [
          '<em>Sentinel</em> deduped 2 alerts into 1 incident',
          '<em>Triage</em> recalled past incident from Hindsight: known pattern',
          '<em>Investigator</em> identified root cause with high confidence',
          '<em>Planner</em> skipped known dead ends, selected proven fix',
          '<em>Executor</em> ran effective action',
          '<em>Verifier</em> metrics healthy for 3 min window',
          '<em>Historian</em> retained postmortem to Hindsight bank',
        ]
      : [
          '<em>Sentinel</em> deduped 2 alerts into 1 incident',
          '<em>Triage</em> found no similar past incident: novel pattern',
          '<em>Investigator</em> root cause diagnosed without historical guidance',
          '<em>Planner</em> trying standard restart/scaling fixes first',
          '<em>Executor</em> ran generic remediation actions',
          '<em>Verifier</em> confirmed service health after retries',
          '<em>Historian</em> retained postmortem for future transfer',
        ];

    setAgentLogs([]);
    logs.forEach((logLine, idx) => {
      setTimeout(() => {
        setCurrentStage(stages[idx].toLowerCase());
        setAgentLogs((prev) => [...prev, logLine]);
        if (idx === stages.length - 1) {
          setIsRunning(false);
          setCurrentStage('historian');
        }
      }, (idx + 1) * 600);
    });
  };

  // Launch 60-second guided demo flow
  const handleRunDemoFlow = async () => {
    setIsDemoRunning(true);
    setActiveTab('warroom');

    try {
      // Step 1: Run INC-102 Baseline (Cold)
      setCurId('INC-102');
      setMemMode(false);
      await triggerRun('INC-102', false).catch(() => {});
      simulateIncidentDisplay('INC-102', false);

      // Step 2: Seed / Learn INC-101
      await seedDemo().catch(() => {});

      // Step 3: Run INC-102 with Memory (Warm)
      setTimeout(() => {
        setMemMode(true);
        simulateIncidentDisplay('INC-102', true);
        setIsDemoRunning(false);
        loadData();
      }, 2500);
    } catch {
      setIsDemoRunning(false);
    }
  };

  const selectedIncident = incidents.find((i) => i.id === curId) || incidents[0];
  const isWarm = memMode && (currentRun?.memory_trail?.length ?? 0) > 0;

  return (
    <div>
      <Header
        health={health}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onResetDemo={async () => {
          await resetDemo();
          loadData();
          loadSelectedIncident(curId);
          showToast('Fresh Hindsight memory bank initialized!');
        }}
        onSeedDemo={async () => {
          await seedDemo();
          loadData();
          loadSelectedIncident(curId);
          showToast('Sample incident runs seeded successfully!');
        }}
        onKill={async () => {
          await killExecution();
          setIsRunning(false);
          loadData();
          showToast('Emergency kill switch triggered!');
        }}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
      />

      <nav className="tabs" role="tablist">
        <button
          className={activeTab === 'warroom' ? 'active' : ''}
          onClick={() => setActiveTab('warroom')}
          role="tab"
          aria-selected={activeTab === 'warroom'}
        >
          Live War Room
        </button>
        <button
          className={activeTab === 'impact' ? 'active' : ''}
          onClick={() => setActiveTab('impact')}
          role="tab"
          aria-selected={activeTab === 'impact'}
        >
          Memory Impact & Analytics
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
          role="tab"
          aria-selected={activeTab === 'history'}
        >
          Incident History
        </button>
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
          role="tab"
          aria-selected={activeTab === 'overview'}
        >
          System Overview
        </button>
      </nav>

      {activeTab === 'warroom' && (
        <main className="console-grid">
          {/* Column 1: Incident Feed */}
          <IncidentFeed
            incidents={incidents}
            selectedId={curId}
            onSelect={(id) => {
              setCurId(id);
            }}
            onOpenCustomModal={() => setIsCustomModalOpen(true)}
          />

          {/* Column 2: Pipeline, Streaming Log, Actions */}
          <section className="stack" aria-label="Incident detail">
            <div className="card">
              <div className="row">
                <div>
                  <div className="lbl" id="sub" style={{ margin: 0 }}>
                    {curId} &bull; {selectedIncident.service}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }} id="ttl">
                    {selectedIncident.description}
                  </div>
                </div>
                <button className="btn" id="rep" onClick={handleReplay} disabled={isRunning}>
                  {isRunning ? 'Running...' : 'Replay'}
                </button>
              </div>

              <div className="seg" style={{ margin: '14px 0' }} role="group" aria-label="Memory mode">
                <button
                  id="mOff"
                  aria-pressed={!memMode}
                  onClick={() => {
                    setMemMode(false);
                    simulateIncidentDisplay(curId, false);
                  }}
                >
                  Without memory
                </button>
                <button
                  id="mOn"
                  aria-pressed={memMode}
                  onClick={() => {
                    setMemMode(true);
                    simulateIncidentDisplay(curId, true);
                  }}
                >
                  With Hindsight memory
                </button>
              </div>

              <PipelineVisualizer
                currentStage={currentStage}
                isResolved={currentRun?.status === 'resolved'}
                isEscalated={currentRun?.status === 'escalated'}
              />
            </div>

            {/* Root Cause Analysis */}
            <RootCauseCard
              rootCause={currentRun?.root_cause_analysis}
              diagnosis={currentRun?.diagnosis}
              isWarm={isWarm}
            />

            {/* Incident Actions, Reasoning & Execution Logs Separated by Tabs */}
            <ActionTabs
              recommendations={currentRun?.actionable_recommendations}
              tried={currentRun?.tried || []}
              succeeded={currentRun?.succeeded || []}
              worsened={currentRun?.worsened || []}
              agentReasoning={currentRun?.agent_reasoning || []}
              agentLogs={agentLogs}
              currentStage={currentStage}
              isResolved={currentRun?.status === 'resolved'}
            />
          </section>

          {/* Column 3: Memory Correlation, Memory Trail, Confidence, Metrics, What-If */}
          <section className="stack" aria-label="Memory and confidence">
            <MemoryCorrelationCard
              correlation={currentRun?.memory_correlation}
              memoryTrail={currentRun?.memory_trail || []}
              targetService={selectedIncident.service}
              isWarm={isWarm}
            />

            <MemoryTrailView trails={currentRun?.memory_trail || []} />

            <ConfidenceGauge
              confidence={currentRun?.confidence || 0.6}
              breakdown={currentRun?.confidence_breakdown}
            />

            <MetricsChart
              coldMinutes={17}
              warmMinutes={currentRun?.minutes ?? 6}
              isWarm={isWarm}
            />

            <WhatIfSlider />
          </section>
        </main>
      )}

      {activeTab === 'impact' && (
        <MemoryImpactView stats={stats} playbooks={playbooks} />
      )}

      {activeTab === 'history' && (
        <IncidentHistoryView
          onInspectRun={(run) => {
            const iid = run.incident_id || run.id;
            setCurId(iid);
            setCurrentRun(run);
            setAgentLogs(run.log_lines || []);
            setCurrentStage(run.status === 'resolved' ? 'historian' : run.status);
            setMemMode(run.memory_on);
            setActiveTab('warroom');
            showToast(`Inspecting ${iid} run #${run.run_id || run.id} in Live War Room`);
          }}
          onOpenCustomModal={() => setIsCustomModalOpen(true)}
        />
      )}

      {activeTab === 'overview' && (
        <LandingHero
          onGoToWarRoom={() => setActiveTab('warroom')}
          onRunDemoFlow={handleRunDemoFlow}
          isDemoRunning={isDemoRunning}
        />
      )}

      {/* Dynamic Incident Ingestion Modal */}
      <DynamicIncidentModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onIncidentCreated={handleIncidentCreated}
      />

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--card)',
            border: '1px solid var(--am)',
            color: 'var(--tx)',
            padding: '12px 18px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 10000,
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span style={{ color: 'var(--te)', fontSize: '16px' }}>●</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
