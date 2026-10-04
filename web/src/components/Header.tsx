import React from 'react';
import { HealthStatus } from '../types';

interface HeaderProps {
  health: HealthStatus | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onResetDemo: () => void;
  onSeedDemo: () => void;
  onKill: () => void;
  onOpenCustomModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  theme,
  onToggleTheme,
  onResetDemo,
  onSeedDemo,
  onKill,
  onOpenCustomModal,
}) => {
  return (
    <header>
      <div className="logo" style={{ fontSize: '20px' }}>
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          stroke="var(--am)"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M15 3l10 4v8c0 6-4 10-10 12C9 25 5 21 5 15V7z" />
          <circle cx="15" cy="14" r="3" />
        </svg>
        <span>SentinelMind</span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {onOpenCustomModal && (
          <button
            className="btn"
            style={{
              minHeight: '40px',
              padding: '0 18px',
              fontSize: '14px',
              border: '1.5px solid var(--am)',
              background: 'var(--amb)',
              color: 'var(--am)',
              fontWeight: 700,
              letterSpacing: '0.02em',
              boxShadow: '0 0 12px rgba(245, 165, 36, 0.18)',
            }}
            onClick={onOpenCustomModal}
            title="Ingest custom telemetry, logs, or stack trace"
          >
            + Ingest Custom Data
          </button>
        )}


        <span className={`pill ${health?.status === 'degraded' ? 'degraded' : ''}`}>
          <b />
          {health?.status === 'degraded' ? 'Memory Degraded' : 'Agents Live'}
        </span>

        {health?.containerized ? (
          <span
            className="pill"
            style={{
              borderColor: 'var(--te)',
              color: 'var(--te)',
              background: 'var(--teb)',
              fontWeight: 700,
              gap: '6px',
            }}
            title="Running in isolated Docker container (Alpine + Python 3.11)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>Docker: Active</span>
          </span>
        ) : (
          <span
            className="pill mono"
            title="Running in local host environment"
          >
            Runtime: Host
          </span>
        )}

        <span className="pill mono">
          Hindsight bank: {health?.hindsight_bank || 'sentinelmind-demo'}
        </span>

        <span className="pill mono">
          LLM: {health?.llm_provider || 'gemini'} ({health?.llm_model || 'gemini-3-flash-preview'})
        </span>


        <button
          className="btn btn-secondary"
          style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
          onClick={onSeedDemo}
          title="Pre-seed sample demo runs"
        >
          Seed Demo
        </button>

        <button
          className="btn btn-secondary"
          style={{ minHeight: '36px', padding: '0 12px', fontSize: '12px' }}
          onClick={onResetDemo}
          title="Create fresh Hindsight bank"
        >
          Reset Bank
        </button>

        <button
          className="btn btn-danger"
          style={{ minHeight: '36px', padding: '0 12px', fontSize: '12px' }}
          onClick={onKill}
          title="Emergency kill switch"
        >
          Kill Switch
        </button>

        <button
          className="btn btn-secondary"
          style={{ minHeight: '36px', padding: '0 12px', fontSize: '12px' }}
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  );
};
