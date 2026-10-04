import React, { useState, useMemo } from 'react';
import { Incident } from '../types';

interface IncidentFeedProps {
  incidents: Incident[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenCustomModal?: () => void;
}

export const IncidentFeed: React.FC<IncidentFeedProps> = ({
  incidents,
  selectedId,
  onSelect,
  onOpenCustomModal,
}) => {
  const [search, setSearch] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('ALL');

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Filter by tag/type
      if (filterTag === 'P1' && inc.severity !== 'P1') return false;
      if (filterTag === 'MEMORY' && inc.tag !== 'Memory') return false;
      if (filterTag === 'LEARNING' && inc.tag !== 'Learning') return false;
      if (filterTag === 'ESCALATED' && inc.status !== 'escalated') return false;
      if (filterTag === 'DYNAMIC' && inc.tag !== 'Dynamic' && !inc.id.startsWith('INC-DYN')) return false;

      // Filter by search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = inc.id.toLowerCase().includes(q);
        const matchesService = inc.service.toLowerCase().includes(q);
        const matchesRc = inc.root_cause.toLowerCase().includes(q);
        const matchesDesc = (inc.description || '').toLowerCase().includes(q);
        return matchesId || matchesService || matchesRc || matchesDesc;
      }
      return true;
    });
  }, [incidents, search, filterTag]);

  return (
    <section className="card" aria-label="Incident feed">
      <div className="row" style={{ alignItems: 'center', marginBottom: '10px' }}>
        <div className="lbl" style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
          INCIDENT FEED ({incidents.length})
        </div>
        {onOpenCustomModal && (
          <button
            className="btn"
            style={{
              minHeight: '34px',
              padding: '0 14px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1.5px solid var(--am)',
              background: 'var(--amb)',
              color: 'var(--am)',
              boxShadow: '0 0 8px rgba(245, 165, 36, 0.15)',
            }}
            onClick={onOpenCustomModal}
            title="Ingest custom telemetry or error logs"
          >
            + Ingest Custom
          </button>
        )}
      </div>

      {/* Live Search Input */}
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Filter by service, root cause, ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter incidents"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--tx)',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Filter Chips */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        {['ALL', 'P1', 'MEMORY', 'LEARNING', 'ESCALATED', 'DYNAMIC'].map((f) => {
          const isActive = filterTag === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilterTag(f)}
              style={{
                background: isActive ? 'var(--amb)' : 'transparent',
                border: isActive ? '1px solid var(--am)' : '1px solid var(--line)',
                color: isActive ? 'var(--am)' : 'var(--mu)',
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {f}
            </button>
          );
        })}
      </div>


      <div
        className="stack"
        id="feed"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: 'calc(100vh - 280px)',
          overflowY: 'auto',
          padding: '4px 2px',
        }}
      >
        {filteredIncidents.length === 0 ? (
          <div className="empty" style={{ padding: '16px 8px', textAlign: 'center' }}>
            No incidents match your filter.
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isSelected = inc.id === selectedId;
            const isWarm = inc.memory_on === true;
            const isEscalated = inc.status === 'escalated';
            const isDynamic = inc.tag === 'Dynamic' || inc.id.startsWith('INC-DYN');

            let tagClass = 't1';
            if (isDynamic) tagClass = 't3';
            else if (isWarm) tagClass = 't2';
            else if (isEscalated) tagClass = 't1';

            return (
              <button
                key={inc.id}
                className="inc"
                data-k={inc.id}
                aria-pressed={isSelected}
                onClick={() => onSelect(inc.id)}
              >
                <span className={`tag ${tagClass}`}>
                  {inc.tag}
                </span>
                <b className="mono">{inc.id}</b>
                <small>{inc.service} · {inc.root_cause || 'diagnosing'}</small>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
