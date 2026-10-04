import React from 'react';
import { MemoryTrailItem } from '../types';

interface MemoryTrailViewProps {
  trails: MemoryTrailItem[];
}

export const MemoryTrailView: React.FC<MemoryTrailViewProps> = ({ trails }) => {
  return (
    <div className="card">
      <div className="lbl" style={{ color: 'var(--am)' }}>
        MEMORY TRAIL
      </div>
      <div id="trail">
        {trails.length === 0 ? (
          <div className="empty">
            No similar past incident. The agent starts cold and will retain this one for next time.
          </div>
        ) : (
          trails.map((t, idx) => (
            <div key={idx} className="mem">
              <h4 className="mono">
                {t.incident_id || t.id} · {t.service}
              </h4>
              <p>Matched on: {t.matched_on}</p>
              <p style={{ marginTop: '6px', color: 'var(--tx)' }}>{t.outcome}</p>
              <div>
                {(t.influenced || ['Planner']).map((inf, i) => (
                  <span key={i} className="chip">
                    Informed {inf}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
