import React, { useState, useEffect, useMemo } from 'react';
import { fetchRunHistory } from '../api';
import { IncidentRun } from '../types';

interface IncidentHistoryViewProps {
  onInspectRun: (run: IncidentRun) => void;
  onOpenCustomModal?: () => void;
}

export const IncidentHistoryView: React.FC<IncidentHistoryViewProps> = ({
  onInspectRun,
  onOpenCustomModal,
}) => {
  const [runs, setRuns] = useState<IncidentRun[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'MEMORY' | 'BASELINE' | 'RESOLVED' | 'ESCALATED' | 'DYNAMIC'>('ALL');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [expandedRunId, setExpandedRunId] = useState<string | number | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRunHistory(100);
      setRuns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load run history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Compute list of unique services
  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => {
      if (r.service) set.add(r.service);
    });
    return Array.from(set).sort();
  }, [runs]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      // Filter mode
      if (filterMode === 'MEMORY' && !r.memory_on) return false;
      if (filterMode === 'BASELINE' && r.memory_on) return false;
      if (filterMode === 'RESOLVED' && r.status !== 'resolved') return false;
      if (filterMode === 'ESCALATED' && r.status !== 'escalated') return false;
      if (filterMode === 'DYNAMIC') {
        const isDyn = (r.incident_id && r.incident_id.startsWith('INC-DYN')) || r.label?.includes('custom');
        if (!isDyn) return false;
      }

      // Filter by service
      if (selectedService !== 'ALL' && r.service !== selectedService) return false;

      // Free text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = (r.incident_id || '').toLowerCase().includes(q) || String(r.id || '').toLowerCase().includes(q);
        const matchesService = (r.service || '').toLowerCase().includes(q);
        const matchesRc = (r.root_cause || r.diagnosis?.root_cause || '').toLowerCase().includes(q);
        const matchesStatus = (r.status || '').toLowerCase().includes(q);
        const matchesLabel = (r.label || '').toLowerCase().includes(q);
        return matchesId || matchesService || matchesRc || matchesStatus || matchesLabel;
      }

      return true;
    });
  }, [runs, filterMode, selectedService, search]);

  // Compute aggregate statistics
  const stats = useMemo(() => {
    const total = runs.length;
    const memoryRuns = runs.filter((r) => r.memory_on);
    const baselineRuns = runs.filter((r) => !r.memory_on);
    const dynamicRuns = runs.filter((r) => (r.incident_id && r.incident_id.startsWith('INC-DYN')) || r.label?.includes('custom'));

    const avgMemMinutes = memoryRuns.length
      ? Math.round((memoryRuns.reduce((sum, r) => sum + (r.minutes || 0), 0) / memoryRuns.length) * 10) / 10
      : 5.5;
    const avgBaseMinutes = baselineRuns.length
      ? Math.round((baselineRuns.reduce((sum, r) => sum + (r.minutes || 0), 0) / baselineRuns.length) * 10) / 10
      : 18.0;

    const timeSavedPct = Math.max(0, Math.round(((avgBaseMinutes - avgMemMinutes) / Math.max(1, avgBaseMinutes)) * 1000) / 10);

    return {
      total,
      memoryCount: memoryRuns.length,
      baselineCount: baselineRuns.length,
      dynamicCount: dynamicRuns.length,
      avgMemMinutes,
      avgBaseMinutes,
      timeSavedPct,
    };
  }, [runs]);

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(filteredRuns, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinelmind-incident-history-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '0 24px 40px 24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Banner & KPI Stat Cards */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
          <div>
            <div className="lbl" style={{ color: 'var(--am)', margin: 0, fontSize: '13px', fontWeight: 700 }}>
              COMPREHENSIVE AUDIT TRAIL
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0 0 0', letterSpacing: '-0.5px' }}>
              Incident Execution History
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--mu)' }}>
              Persistent SQLite records for all AI agent runs, dynamic custom telemetry analyses, and Hindsight memory recalls.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {onOpenCustomModal && (
              <button
                className="btn btn-secondary"
                style={{
                  minHeight: '38px',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: '1.5px solid var(--am)',
                  color: 'var(--am)',
                  background: 'var(--amb)',
                }}
                onClick={onOpenCustomModal}
              >
                + Ingest Dynamic Data
              </button>
            )}
            <button
              className="btn btn-secondary"
              style={{ minHeight: '38px', padding: '0 14px', fontSize: '13px' }}
              onClick={handleExportJson}
              disabled={filteredRuns.length === 0}
            >
              Export JSON
            </button>
            <button
              className="btn"
              style={{ minHeight: '38px', padding: '0 16px', fontSize: '13px' }}
              onClick={loadHistory}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--am)' }}>
            <div className="lbl" style={{ color: 'var(--mu)', margin: 0, fontSize: '12px' }}>
              TOTAL RUNS RECORDED
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, margin: '6px 0 2px 0', color: 'var(--tx)' }}>
              {stats.total}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mu)' }}>
              {stats.dynamicCount} dynamic runs &bull; {stats.memoryCount} memory-guided
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--te)' }}>
            <div className="lbl" style={{ color: 'var(--te)', margin: 0, fontSize: '12px' }}>
              TIME SAVED (WARM MEMORY)
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, margin: '6px 0 2px 0', color: 'var(--te)' }}>
              {stats.timeSavedPct}%
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mu)' }}>
              {stats.avgMemMinutes}m with memory vs {stats.avgBaseMinutes}m cold
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--co)' }}>
            <div className="lbl" style={{ color: 'var(--co)', margin: 0, fontSize: '12px' }}>
              BASELINE COLD RUNS
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, margin: '6px 0 2px 0', color: 'var(--tx)' }}>
              {stats.baselineCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mu)' }}>
              Trial-and-error escalation without prior memory
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--am)' }}>
            <div className="lbl" style={{ color: 'var(--am)', margin: 0, fontSize: '12px' }}>
              DYNAMIC / CUSTOM ANALYSES
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, margin: '6px 0 2px 0', color: 'var(--tx)' }}>
              {stats.dynamicCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mu)' }}>
              Persisted across browser refreshes & restarts
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search box */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by incident ID, service, root cause, or status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--tx)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Service Dropdown */}
          <div style={{ minWidth: '180px' }}>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--tx)',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Services ({uniqueServices.length})</option>
              {uniqueServices.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--mu)', fontWeight: 600, marginRight: '4px' }}>
            Filter:
          </span>
          {(['ALL', 'MEMORY', 'BASELINE', 'RESOLVED', 'ESCALATED', 'DYNAMIC'] as const).map((mode) => {
            const isActive = filterMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                style={{
                  background: isActive ? 'var(--amb)' : 'transparent',
                  border: isActive ? '1px solid var(--am)' : '1px solid var(--line)',
                  color: isActive ? 'var(--am)' : 'var(--mu)',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {mode === 'ALL' ? 'ALL RUNS' : mode}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--mu)' }}>
            Showing <strong>{filteredRuns.length}</strong> of {runs.length} runs
          </span>
        </div>
      </div>

      {/* Main Runs Table / List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--mu)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
              Loading incident execution history...
            </div>
            <div style={{ fontSize: '13px' }}>Querying SQLite database checkpoints and playbooks</div>
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--co)' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Error Loading History</div>
            <div style={{ fontSize: '13px', color: 'var(--mu)', marginBottom: '16px' }}>{error}</div>
            <button className="btn" onClick={loadHistory}>Retry</button>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--mu)' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
              No historical incident runs matched the criteria
            </div>
            <div style={{ fontSize: '13px', marginBottom: '18px' }}>
              Run an incident from the Live War Room or ingest dynamic telemetry to create history.
            </div>
            {onOpenCustomModal && (
              <button
                className="btn"
                style={{ minHeight: '36px', padding: '0 16px', fontSize: '13px' }}
                onClick={onOpenCustomModal}
              >
                + Ingest Dynamic Incident
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.3)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)', width: '60px' }}>RUN</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>INCIDENT & SERVICE</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>MEMORY MODE</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>ROOT CAUSE</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>STATUS</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>MTTR</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>CONFIDENCE</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)' }}>ACTIONS ATTEMPTED</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--mu)', textAlign: 'right' }}>WAR ROOM</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run, idx) => {
                  const isExpanded = expandedRunId === (run.run_id || run.id || idx);
                  const isDynamic = (run.incident_id && run.incident_id.startsWith('INC-DYN')) || run.label?.includes('custom');
                  const rc = run.root_cause || run.diagnosis?.root_cause || 'unknown';
                  const confPct = Math.round((run.confidence || 0.6) * 100);

                  return (
                    <React.Fragment key={run.run_id || `${run.incident_id}-${idx}`}>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--line)',
                          background: isExpanded ? 'rgba(245, 165, 36, 0.04)' : idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onClick={() => setExpandedRunId(isExpanded ? null : (run.run_id || run.id || idx))}
                      >
                        {/* Run # */}
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: 'var(--mu)' }}>
                          #{run.run_id || idx + 1}
                        </td>

                        {/* Incident ID & Service */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              className="mono"
                              style={{
                                fontWeight: 800,
                                fontSize: '13px',
                                color: isDynamic ? 'var(--am)' : 'var(--tx)',
                              }}
                            >
                              {run.incident_id || run.id}
                            </span>
                            {isDynamic && (
                              <span className="tag t3" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                Dynamic
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--mu)', marginTop: '2px' }}>
                            {run.service} &bull; <span style={{ textTransform: 'uppercase' }}>{run.severity || 'P2'}</span>
                          </div>
                        </td>

                        {/* Memory Mode */}
                        <td style={{ padding: '14px 16px' }}>
                          {run.memory_on ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(61, 214, 195, 0.12)',
                                border: '1px solid var(--te)',
                                color: 'var(--te)',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              Hindsight Memory
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(255, 138, 107, 0.12)',
                                border: '1px solid var(--co)',
                                color: 'var(--co)',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              Baseline Cold
                            </span>
                          )}
                        </td>

                        {/* Root Cause */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx)' }}>
                            {rc.replace(/_/g, ' ')}
                          </div>
                          {run.created_at && (
                            <div style={{ fontSize: '11px', color: 'var(--mu)', marginTop: '2px' }}>
                              {run.created_at}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          {run.status === 'resolved' ? (
                            <span className="tag t2" style={{ fontSize: '11px' }}>
                              Resolved
                            </span>
                          ) : run.status === 'escalated' ? (
                            <span className="tag t1" style={{ fontSize: '11px' }}>
                              Escalated
                            </span>
                          ) : (
                            <span className="tag t3" style={{ fontSize: '11px' }}>
                              {run.status}
                            </span>
                          )}
                        </td>

                        {/* MTTR */}
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: run.minutes <= 6 ? 'var(--te)' : 'var(--tx)' }}>
                          {run.minutes || 0} min
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '50px', background: 'var(--line)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${confPct}%`,
                                  height: '100%',
                                  background: confPct >= 80 ? 'var(--te)' : confPct >= 60 ? 'var(--am)' : 'var(--co)',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{confPct}%</span>
                          </div>
                        </td>

                        {/* Actions Attempted */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {(!run.tried || run.tried.length === 0) ? (
                              <span style={{ color: 'var(--mu)', fontSize: '12px' }}>None</span>
                            ) : (
                              run.tried.map((action) => {
                                const isSuccess = (run.succeeded || []).includes(action);
                                const isHarmful = (run.worsened || []).includes(action);
                                return (
                                  <span
                                    key={action}
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontFamily: 'monospace',
                                      background: isSuccess
                                        ? 'rgba(61, 214, 195, 0.15)'
                                        : isHarmful
                                        ? 'rgba(255, 138, 107, 0.2)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                      color: isSuccess
                                        ? 'var(--te)'
                                        : isHarmful
                                        ? 'var(--co)'
                                        : 'var(--tx)',
                                      border: isSuccess
                                        ? '1px solid rgba(61, 214, 195, 0.3)'
                                        : isHarmful
                                        ? '1px solid rgba(255, 138, 107, 0.3)'
                                        : '1px solid var(--line)',
                                    }}
                                  >
                                    {isSuccess ? '[OK] ' : isHarmful ? '[WARN] ' : ''}
                                    {action}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Action: Inspect */}
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            className="btn btn-secondary"
                            style={{
                              minHeight: '30px',
                              padding: '0 12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              borderColor: 'var(--am)',
                              color: 'var(--am)',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectRun(run);
                            }}
                            title="Load this incident into the Live War Room"
                          >
                            Inspect &rarr;
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Run Detail Drawer */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(0, 0, 0, 0.35)', borderBottom: '2px solid var(--line)' }}>
                          <td colSpan={9} style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                              {/* Root Cause Card */}
                              <div
                                style={{
                                  background: 'var(--card)',
                                  border: '1px solid var(--line)',
                                  borderRadius: '8px',
                                  padding: '16px',
                                }}
                              >
                                <div className="lbl" style={{ color: 'var(--am)', margin: 0, fontSize: '11px' }}>
                                  ROOT CAUSE ANALYSIS
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: 700, margin: '4px 0 8px 0' }}>
                                  {run.root_cause_analysis?.title || rc.replace(/_/g, ' ').toUpperCase()}
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--tx)', lineHeight: 1.5, margin: '0 0 10px 0' }}>
                                  {run.root_cause_analysis?.explanation || run.diagnosis?.explanation || 'Root cause determined by SentinelMind diagnostic reasoning.'}
                                </p>
                                {run.root_cause_analysis?.impact && (
                                  <div style={{ fontSize: '12px', color: 'var(--mu)', background: 'var(--bg)', padding: '6px 10px', borderRadius: '4px', borderLeft: '3px solid var(--am)' }}>
                                    <strong>Impact:</strong> {run.root_cause_analysis.impact}
                                  </div>
                                )}
                              </div>

                              {/* Actionable Recommendations */}
                              <div
                                style={{
                                  background: 'var(--card)',
                                  border: '1px solid var(--line)',
                                  borderRadius: '8px',
                                  padding: '16px',
                                }}
                              >
                                <div className="lbl" style={{ color: 'var(--te)', margin: 0, fontSize: '11px' }}>
                                  RECOMMENDATIONS EVALUATED
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                  {(run.actionable_recommendations && run.actionable_recommendations.length > 0) ? (
                                    run.actionable_recommendations.map((rec) => (
                                      <div
                                        key={rec.action}
                                        style={{
                                          fontSize: '12px',
                                          padding: '8px 10px',
                                          background: 'var(--bg)',
                                          borderRadius: '6px',
                                          borderLeft: rec.risk === 'high' ? '3px solid var(--co)' : '3px solid var(--te)',
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <strong className="mono">{rec.action}</strong>
                                          <span style={{ fontSize: '10px', color: rec.risk === 'high' ? 'var(--co)' : 'var(--te)' }}>
                                            {rec.risk.toUpperCase()} RISK
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--mu)', marginTop: '4px' }}>
                                          {rec.rationale}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ fontSize: '12px', color: 'var(--mu)' }}>
                                      Tried actions: {run.tried.join(', ') || 'No actions scheduled.'}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Reasoning Summary & Memory Link */}
                              <div
                                style={{
                                  background: 'var(--card)',
                                  border: '1px solid var(--line)',
                                  borderRadius: '8px',
                                  padding: '16px',
                                }}
                              >
                                <div className="lbl" style={{ color: 'var(--co)', margin: 0, fontSize: '11px' }}>
                                  KNOWLEDGE & MEMORY TRANSFER
                                </div>
                                {run.memory_correlation ? (
                                  <div style={{ fontSize: '12px', marginTop: '8px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--te)', marginBottom: '4px' }}>
                                      Reused Fix from {run.memory_correlation.source_incident_id} ({run.memory_correlation.source_service})
                                    </div>
                                    <p style={{ margin: '0 0 8px 0', color: 'var(--tx)', lineHeight: 1.4 }}>
                                      {run.memory_correlation.transferred_learnings}
                                    </p>
                                    <div style={{ fontSize: '11px', color: 'var(--mu)' }}>
                                      Similarity match: {run.memory_correlation.similarity_pct}%
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '12px', color: 'var(--mu)', marginTop: '8px' }}>
                                    {run.memory_on
                                      ? 'Novel incident pattern. Postmortem analysis recorded to memory bank for future cross-service recall.'
                                      : 'Baseline cold run executed without memory recall.'}
                                  </div>
                                )}

                                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn"
                                    style={{ minHeight: '34px', padding: '0 16px', fontSize: '12px' }}
                                    onClick={() => onInspectRun(run)}
                                  >
                                    Open Full Analysis in War Room &rarr;
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
