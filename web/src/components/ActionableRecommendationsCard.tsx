import React from 'react';
import { ActionableRecommendation } from '../types';

interface ActionableRecommendationsCardProps {
  recommendations?: ActionableRecommendation[];
  tried?: string[];
  succeeded?: string[];
  worsened?: string[];
}

export const ActionableRecommendationsCard: React.FC<ActionableRecommendationsCardProps> = ({
  recommendations = [],
  tried = [],
  succeeded = [],
  worsened = [],
}) => {
  const activeRecs = recommendations.filter((r) => !r.avoid_reason);
  const avoidRecs = recommendations.filter((r) => !!r.avoid_reason);

  if (activeRecs.length === 0 && avoidRecs.length === 0) {
    return (
      <div className="card">
        <div className="lbl" style={{ color: 'var(--am)' }}>
          ACTIONABLE RECOMMENDATIONS
        </div>
        <div className="empty">Planner is evaluating catalog mitigations and memory playbooks...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="lbl" style={{ color: 'var(--am)' }}>
        ACTIONABLE RECOMMENDATIONS
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
        {activeRecs.map((rec, idx) => {
          const isTried = tried.includes(rec.action);
          const isSuccess = succeeded.includes(rec.action);
          const isWorse = worsened.includes(rec.action);

          const statusBadge = isSuccess
            ? { text: 'Resolved', bg: 'var(--teb)', color: 'var(--te)' }
            : isWorse
            ? { text: 'Rolled Back', bg: 'var(--cob)', color: 'var(--co)' }
            : isTried
            ? { text: 'Executed', bg: 'var(--amb)', color: 'var(--am)' }
            : null;

          const riskColor =
            rec.risk === 'low'
              ? 'var(--te)'
              : rec.risk === 'medium'
              ? 'var(--am)'
              : 'var(--co)';

          return (
            <div
              key={idx}
              style={{
                background: 'var(--bg)',
                border: rec.is_proven_fix ? '1px solid var(--te)' : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      background: 'var(--line)',
                      color: 'var(--tx)',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {rec.priority}
                  </span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: '15px' }}>
                    {rec.action}
                  </span>
                  {rec.is_proven_fix && (
                    <span
                      style={{
                        fontSize: '12px',
                        background: 'var(--teb)',
                        color: 'var(--te)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      Proven Fix
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: riskColor,
                      border: `1px solid ${riskColor}`,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}
                  >
                    {rec.risk} risk
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--mu)', fontWeight: 600 }}>
                    ~{rec.expected_minutes}m
                  </span>
                  {statusBadge && (
                    <span
                      style={{
                        fontSize: '12px',
                        background: statusBadge.bg,
                        color: statusBadge.color,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      {statusBadge.text}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '13.5px', color: 'var(--mu)', marginTop: '8px', lineHeight: 1.5 }}>
                {rec.rationale}
              </div>

            </div>
          );
        })}

        {avoidRecs.length > 0 && (
          <div
            style={{
              marginTop: '6px',
              background: 'var(--cob)',
              border: '1px solid var(--co)',
              borderRadius: '8px',
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--co)', fontWeight: 700, fontSize: '12px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              ACTIONS TO AVOID (WARNED BY HINDSIGHT MEMORY)
            </div>
            {avoidRecs.map((avoid, i) => (
              <div key={i} style={{ marginTop: '6px', fontSize: '12px', color: 'var(--tx)' }}>
                <span className="mono" style={{ color: 'var(--co)', fontWeight: 700 }}>
                  {avoid.action}
                </span>
                : {avoid.avoid_reason}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
