import React from 'react';
import { MemoryCorrelation, MemoryTrailItem } from '../types';

interface MemoryCorrelationCardProps {
  correlation?: MemoryCorrelation | null;
  memoryTrail?: MemoryTrailItem[];
  targetService: string;
  isWarm: boolean;
}

export const MemoryCorrelationCard: React.FC<MemoryCorrelationCardProps> = ({
  correlation,
  memoryTrail = [],
  targetService,
  isWarm,
}) => {
  // If correlation object is present or we have a memory trail item
  const sourceId = correlation?.source_incident_id || (memoryTrail[0]?.incident_id || memoryTrail[0]?.id);
  const sourceService = correlation?.source_service || (memoryTrail[0]?.service || 'prior-service');
  const similarityPct = correlation?.similarity_pct ?? (isWarm ? 94 : 0);
  const sharedRc = correlation?.shared_root_cause || (memoryTrail[0]?.matched_on || 'shared failure pattern');
  const factors = correlation?.correlation_factors || [
    `Telemetry signature alignment: ${memoryTrail[0]?.matched_on || 'error & latency spike'}`,
    `Cross-service architectural overlap: ${sourceService} &rarr; ${targetService}`,
    `Historical mitigation verification: ${memoryTrail[0]?.outcome || 'effective fix'}`,
  ];
  const learnings = correlation?.transferred_learnings || (memoryTrail[0] ? `Direct knowledge transfer from ${sourceId} to ${targetService}.` : '');

  if (!isWarm || (!correlation && memoryTrail.length === 0)) {
    return (
      <div className="card">
        <div className="lbl" style={{ color: 'var(--am)' }}>
          CROSS-SERVICE MEMORY CORRELATION
        </div>
        <div className="empty">
          No cross-service correlation active. System is running cold. Once resolved, Historian will retain learnings to correlate with future incidents.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div className="lbl" style={{ color: 'var(--am)', margin: 0 }}>
            CROSS-SERVICE MEMORY CORRELATION
          </div>
          <div style={{ fontSize: '12px', color: 'var(--mu)', marginTop: '2px' }}>
            Transferred Pattern: <span className="mono" style={{ color: 'var(--am)' }}>{sharedRc}</span>
          </div>
        </div>
        <span
          className="mono"
          style={{
            background: 'var(--teb)',
            color: 'var(--te)',
            padding: '3px 8px',
            borderRadius: '4px',
            fontWeight: 700,
            fontSize: '12px',
          }}
        >
          {similarityPct}% SIMILARITY
        </span>
      </div>

      {/* Visual Transfer Linkage Diagram */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '6px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ textAlign: 'center', flex: 1 }}>
            <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
              Source Incident
            </span>
            <span className="mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--am)' }}>
              {sourceId}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>
              ({sourceService})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1.2 }}>
            <span
              className="mono"
              style={{
                fontSize: '10px',
                color: 'var(--te)',
                background: 'var(--card)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--line)',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              Transfer Linkage
            </span>
            <svg width="100%" height="16" viewBox="0 0 120 16" fill="none" style={{ overflow: 'visible' }}>
              <line x1="0" y1="8" x2="110" y2="8" stroke="var(--te)" strokeWidth="2" strokeDasharray="3 3" />
              <polygon points="110,4 118,8 110,12" fill="var(--te)" />
            </svg>
          </div>

          <div style={{ textAlign: 'center', flex: 1 }}>
            <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
              Current Incident
            </span>
            <span className="mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--tx)' }}>
              Target
            </span>
            <span style={{ fontSize: '11px', color: 'var(--mu)', display: 'block' }}>
              ({targetService})
            </span>
          </div>
        </div>

        {learnings && (
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--line)',
              fontSize: '12px',
              color: 'var(--tx)',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: 'var(--te)' }}>Transferred Learning: </strong>
            {learnings}
          </div>
        )}
      </div>

      {/* Correlation Factors */}
      <div style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '11px', color: 'var(--mu)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Correlation Factors
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {factors.map((factor, i) => (
            <div
              key={i}
              style={{
                fontSize: '11px',
                color: 'var(--mu)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--te)" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span dangerouslySetInnerHTML={{ __html: factor }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
