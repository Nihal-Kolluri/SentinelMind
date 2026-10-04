import React from 'react';
import { RootCauseAnalysis } from '../types';

interface RootCauseCardProps {
  rootCause?: RootCauseAnalysis | null;
  diagnosis?: {
    root_cause?: string;
    explanation?: string;
    confidence?: number;
    evidence?: string[];
  };
  isWarm?: boolean;
}

export const RootCauseCard: React.FC<RootCauseCardProps> = ({
  rootCause,
  diagnosis,
  isWarm,
}) => {
  const rcName = rootCause?.title || diagnosis?.root_cause?.replace(/_/g, ' ').toUpperCase();
  const explanation = rootCause?.explanation || diagnosis?.explanation;
  const evidence = rootCause?.evidence || diagnosis?.evidence || [];
  const severity = rootCause?.severity || 'P1';
  const category = rootCause?.category || 'performance';

  if (!rcName && !explanation) {
    return (
      <div className="card">
        <div className="lbl" style={{ color: 'var(--am)' }}>
          ROOT CAUSE ANALYSIS
        </div>
        <div className="empty">
          Investigator is evaluating telemetry signals and service logs to identify root cause...
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div className="lbl" style={{ color: 'var(--am)', margin: 0 }}>
            ROOT CAUSE ANALYSIS
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
            {rcName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span className="tag t1">{severity}</span>
          <span className="tag t3">{category}</span>
          {isWarm ? (
            <span className="tag t2">Verified in Memory</span>
          ) : (
            <span className="tag t3">Novel Anomaly</span>
          )}
        </div>
      </div>

      {explanation && (
        <p style={{ margin: '8px 0', fontSize: '13px', color: 'var(--tx)', lineHeight: 1.5 }}>
          {explanation}
        </p>
      )}

      {rootCause?.impact && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--mu)',
            background: 'var(--bg)',
            padding: '6px 10px',
            borderRadius: '6px',
            marginTop: '6px',
            borderLeft: '3px solid var(--am)',
          }}
        >
          <strong style={{ color: 'var(--tx)' }}>Impact:</strong> {rootCause.impact}
        </div>
      )}

      {evidence.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', color: 'var(--mu)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Diagnostic Evidence
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {evidence.map((ev, i) => (
              <span
                key={i}
                className="mono"
                style={{
                  fontSize: '11px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  color: 'var(--te)',
                }}
              >
                {ev}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
