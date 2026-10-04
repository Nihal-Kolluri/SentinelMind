import React, { useState } from 'react';
import { analyzeCustomIncident, CustomIncidentPayload } from '../api';
import { Incident, IncidentRun } from '../types';

interface DynamicIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIncidentCreated: (incident: Incident, run?: IncidentRun) => void;
}

const TEMPLATES: Array<{
  name: string;
  data: CustomIncidentPayload;
}> = [
  {
    name: 'DB Connection Starvation',
    data: {
      service: 'payment-gateway',
      severity: 'P1',
      category: 'performance',
      description: 'Connection pool exhausted under spike in transaction volume',
      p95_ms: 5400,
      error_rate: 0.16,
      logs: [
        'payment-gateway ERROR could not acquire connection from pool (size=20, waiting=340)',
        'postgres WARN max connections 200 reached, remaining slots reserved for superuser',
        'hikari-pool WARN connection timeout after 30000ms',
      ],
      alerts: ['payment-gateway p95 latency 5400ms', 'payment-gateway error rate 16.0%'],
      deploys: ['none in last 24h'],
      root_cause: 'db_pool_exhaustion',
      effective_action: 'increase_db_pool',
      memory_on: true,
      run_immediately: true,
    },
  },
  {
    name: 'Redis Cache Stampede',
    data: {
      service: 'product-catalog',
      severity: 'P2',
      category: 'performance',
      description: 'Simultaneous expiration of flash sale item cache keys',
      p95_ms: 4100,
      error_rate: 0.07,
      logs: [
        'product-catalog WARN cache MISS ratio spiked to 94%',
        'redis INFO 150k keys expired in 1s window',
        'product-catalog ERROR database CPU 98% from identical product SELECT queries',
      ],
      alerts: ['product-catalog p95 latency 4100ms', 'product-catalog error rate 7.0%'],
      deploys: ['12m ago product-catalog v2.41: shortened TTL to 45s'],
      root_cause: 'cache_stampede',
      effective_action: 'enable_request_coalescing',
      memory_on: true,
      run_immediately: true,
    },
  },
  {
    name: 'Worker Node Memory Leak',
    data: {
      service: 'pdf-generator',
      severity: 'P2',
      category: 'performance',
      description: 'Unbounded memory growth in image rendering buffer',
      p95_ms: 3200,
      error_rate: 0.05,
      logs: [
        'pdf-generator WARN worker heap usage 94% (3.8GB / 4.0GB)',
        'kernel WARN oom-killer invoked on pid 4410 (node)',
        'pdf-generator ERROR worker crashloop restarted 4 times',
      ],
      alerts: ['pdf-generator memory usage 95%', 'pdf-generator crashloop restart'],
      deploys: ['2h ago pdf-generator v1.8.0: upgraded canvas renderer'],
      root_cause: 'memory_leak',
      effective_action: 'restart_pods',
      memory_on: true,
      run_immediately: true,
    },
  },
  {
    name: 'Downstream Rate Limit / 429 Surge',
    data: {
      service: 'notification-sender',
      severity: 'P2',
      category: 'performance',
      description: 'Upstream SMS provider rate limit triggered by marketing blast',
      p95_ms: 3900,
      error_rate: 0.11,
      logs: [
        'notification-sender ERROR HTTP 429 Too Many Requests from twilio-api',
        'notification-sender WARN retry backoff queue saturated (8,200 messages in flight)',
      ],
      alerts: ['notification-sender p95 latency 3900ms', 'notification-sender HTTP 429 rate 11%'],
      deploys: ['none in last 12h'],
      root_cause: 'downstream_rate_limit',
      effective_action: 'enable_request_coalescing',
      memory_on: true,
      run_immediately: true,
    },
  },
  {
    name: 'Financial Ledger Deadlock',
    data: {
      service: 'billing-engine',
      severity: 'P1',
      category: 'data',
      description: 'Row-level locking deadlock across concurrent ledger balance updates',
      p95_ms: 6800,
      error_rate: 0.24,
      logs: [
        'billing-engine ERROR deadlock detected: Process 4182 waits for ShareLock on transaction 9128',
        'postgres ERROR statement 0x481 failed: deadlock detected with peer transaction',
      ],
      alerts: ['billing-engine database deadlock detected', 'billing-engine error rate 24%'],
      deploys: ['45m ago billing-engine v4.1: concurrent ledger reconciliation job'],
      root_cause: 'database_lock_contention',
      effective_action: 'failover_db',
      memory_on: true,
      run_immediately: true,
    },
  },
  {
    name: 'Docker Container OOMKilled',
    data: {
      service: 'search-indexer',
      severity: 'P1',
      category: 'performance',
      description: 'Docker container killed by Linux kernel OOM (cgroup limit exceeded, exit code 137)',
      p95_ms: 6200,
      error_rate: 0.19,
      logs: [
        'dockerd[1482]: container search-indexer-98a2f1 exited with status 137 (OOMKilled)',
        'kernel: [12948.12] cgroup: memory.max limit 536870912 reached. OOM killer sacrificed pid 8412 (search-indexer)',
        'dockerd[1482]: health check failed for search-indexer: curl http://localhost:8000/api/health timed out',
        'k8s-kubelet: container failed liveness probe, restart count: 5',
      ],
      alerts: ['search-indexer container OOMKilled exit code 137', 'search-indexer error rate 19.0%'],
      deploys: ['18m ago search-indexer v2.8.1: reduced Docker memory limit to 512MB'],
      root_cause: 'memory_leak',
      effective_action: 'restart_pods',
      memory_on: true,
      run_immediately: true,
    },
  },
];

export const DynamicIncidentModal: React.FC<DynamicIncidentModalProps> = ({
  isOpen,
  onClose,
  onIncidentCreated,
}) => {
  const [mode, setMode] = useState<'template' | 'custom' | 'raw'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [analyzingStage, setAnalyzingStage] = useState<string>('');

  // Custom Form State
  const [service, setService] = useState<string>('custom-api');
  const [severity, setSeverity] = useState<string>('P1');
  const [category, setCategory] = useState<string>('performance');
  const [description, setDescription] = useState<string>('High error rate and latency anomaly');
  const [p95Ms, setP95Ms] = useState<number>(4500);
  const [errorRate, setErrorRate] = useState<number>(0.12);
  const [logsText, setLogsText] = useState<string>(
    'custom-api ERROR database timeout acquiring client slot\npostgres WARN connections 198/200'
  );
  const [deploysText, setDeploysText] = useState<string>('none in last 24h');
  const [rawPayload, setRawPayload] = useState<string>('');
  const [useMemory, setUseMemory] = useState<boolean>(true);
  const [runImmediately, setRunImmediately] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleApplyTemplate = (idx: number) => {
    setSelectedTemplate(idx);
    const t = TEMPLATES[idx].data;
    setService(t.service);
    setSeverity(t.severity);
    setCategory(t.category);
    setDescription(t.description || '');
    setP95Ms(t.p95_ms || 3500);
    setErrorRate(t.error_rate || 0.05);
    setLogsText((t.logs || []).join('\n'));
    setDeploysText((t.deploys || []).join('\n'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAnalyzingStage('Sentinel Ingesting Telemetry...');

    try {
      const logs = logsText.split('\n').map((l) => l.trim()).filter(Boolean);
      const deploys = deploysText.split('\n').map((d) => d.trim()).filter(Boolean);

      const payload: CustomIncidentPayload =
        mode === 'raw'
          ? {
              service: service || 'custom-service',
              severity,
              category,
              raw_payload: rawPayload,
              memory_on: useMemory,
              run_immediately: runImmediately,
            }
          : {
              service,
              severity,
              category,
              description,
              p95_ms: p95Ms,
              error_rate: errorRate,
              logs,
              deploys,
              memory_on: useMemory,
              run_immediately: runImmediately,
            };

      // Progress animation simulation
      setTimeout(() => setAnalyzingStage('Triage Querying Hindsight Memory Bank...'), 400);
      setTimeout(() => setAnalyzingStage('Investigator Deducing Root Cause Evidence...'), 900);
      setTimeout(() => setAnalyzingStage('Planner Ordering Actionable Recommendations...'), 1400);

      const res = await analyzeCustomIncident(payload);

      const newIncident: Incident = {
        id: res.incident_id,
        service: res.scenario.service,
        severity: res.scenario.severity,
        category: res.scenario.category,
        root_cause: res.scenario.root_cause,
        description: res.scenario.description,
        tag: 'Dynamic',
        status: res.run ? res.run.status : 'idle',
        minutes: res.run ? res.run.minutes : 0,
        memory_on: res.run ? res.run.memory_on : useMemory,
        latest_run: res.run || null,
      };

      setIsSubmitting(false);
      onIncidentCreated(newIncident, res.run);
      onClose();
    } catch (err: any) {
      alert(`Failed to ingest custom incident: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          border: '1px solid var(--am)',
          padding: '24px',
        }}
      >
        <div className="row" style={{ alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div className="lbl" style={{ color: 'var(--am)', margin: 0, fontSize: '13px', fontWeight: 700 }}>
              DYNAMIC DATA INGESTION & ANALYSIS
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '2px' }}>
              Analyze Custom Telemetry & Logs
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ minHeight: '34px', padding: '0 10px', fontSize: '15px' }}
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="seg" style={{ marginBottom: '16px' }}>
          <button
            type="button"
            style={{ fontSize: '14px', fontWeight: 700, minHeight: '44px' }}
            aria-pressed={mode === 'template'}
            onClick={() => setMode('template')}
          >
            Pre-built Scenarios
          </button>
          <button
            type="button"
            style={{ fontSize: '14px', fontWeight: 700, minHeight: '44px' }}
            aria-pressed={mode === 'custom'}
            onClick={() => setMode('custom')}
          >
            Custom Form Fields
          </button>
          <button
            type="button"
            style={{ fontSize: '14px', fontWeight: 700, minHeight: '44px' }}
            aria-pressed={mode === 'raw'}
            onClick={() => setMode('raw')}
          >
            Paste Raw Telemetry / Logs
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'template' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: 'var(--mu)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                Select Incident Template:
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      background: selectedTemplate === idx ? 'var(--amb)' : 'var(--bg)',
                      border: selectedTemplate === idx ? '1.5px solid var(--am)' : '1px solid var(--line)',
                      color: selectedTemplate === idx ? 'var(--am)' : 'var(--tx)',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => handleApplyTemplate(idx)}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>


              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <strong>Service:</strong> <span className="mono">{service}</span> &bull;{' '}
                  <strong>Severity:</strong> <span className="tag t1">{severity}</span> &bull;{' '}
                  <strong>Category:</strong> <span className="tag t3">{category}</span>
                </div>
                <div style={{ marginTop: '6px', color: 'var(--mu)' }}>
                  <strong>Description:</strong> {description}
                </div>
                <div style={{ marginTop: '6px', color: 'var(--te)' }} className="mono">
                  p95: {p95Ms}ms &bull; Error Rate: {(errorRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Service Name</label>
                  <input
                    type="text"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--tx)',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--tx)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="P1">P1 (Critical / Outage)</option>
                    <option value="P2">P2 (Major Degradation)</option>
                    <option value="P3">P3 (Moderate)</option>
                    <option value="P4">P4 (Minor)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Incident Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--tx)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>p95 Latency (ms): {p95Ms}</label>
                  <input
                    type="number"
                    min="100"
                    max="15000"
                    step="100"
                    value={p95Ms}
                    onChange={(e) => setP95Ms(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--tx)',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Error Rate (%): {(errorRate * 100).toFixed(1)}%</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={errorRate}
                    onChange={(e) => setErrorRate(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--tx)',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Diagnostic Logs (one per line)</label>
                <textarea
                  rows={3}
                  value={logsText}
                  onChange={(e) => setLogsText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--tx)',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>Recent Deployments / Changes</label>
                <input
                  type="text"
                  value={deploysText}
                  onChange={(e) => setDeploysText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--tx)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          )}

          {mode === 'raw' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: 'var(--mu)', display: 'block', marginBottom: '6px' }}>
                Paste Raw Server Log, Stack Trace, or Telemetry JSON:
              </label>
              <textarea
                rows={6}
                value={rawPayload}
                onChange={(e) => setRawPayload(e.target.value)}
                placeholder="2026-09-28 20:41:02 [ERROR] orders-service: connection pool exhausted (size=20, waiting=340)&#10;at org.postgresql.core.v3.ConnectionFactoryImpl.openConnectionImpl(ConnectionFactoryImpl.java:257)..."
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--tx)',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                }}
              />
              <small style={{ color: 'var(--mu)', display: 'block', marginTop: '4px' }}>
                SentinelMind AI extractor will automatically parse service, error rates, root cause, and signals.
              </small>
            </div>
          )}

          {/* Options */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={useMemory}
                onChange={(e) => setUseMemory(e.target.checked)}
              />
              <span>
                <strong>Recall Vectorize Hindsight Memory</strong> (Accelerate analysis using cross-service incident priors)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={runImmediately}
                onChange={(e) => setRunImmediately(e.target.checked)}
              />
              <span>
                <strong>Execute Multi-Agent Swarm Immediately</strong> (Generate Root Cause, Recommendations & Reasoning)
              </span>
            </label>
          </div>

          {/* Submitting Loading State */}
          {isSubmitting && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'var(--amb)',
                border: '1px solid var(--am)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ color: 'var(--am)', fontWeight: 700, fontSize: '13px' }}>
                {analyzingStage}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--mu)', marginTop: '4px' }}>
                Running 7-Agent Swarm: Sentinel &rarr; Triage &rarr; Investigator &rarr; Planner &rarr; Executor &rarr; Verifier &rarr; Historian
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '14px', minHeight: '44px', padding: '0 18px', fontWeight: 600 }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              style={{ fontSize: '15px', minHeight: '46px', padding: '0 24px', fontWeight: 700 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Analyzing Swarm...' : 'Run Multi-Agent Analysis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
