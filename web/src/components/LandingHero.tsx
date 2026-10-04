import React from 'react';

interface LandingHeroProps {
  onGoToWarRoom: () => void;
  onRunDemoFlow: () => void;
  isDemoRunning: boolean;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onGoToWarRoom,
  onRunDemoFlow,
  isDemoRunning,
}) => {
  return (
    <div className="hero">
      <div className="pill mono" style={{ marginBottom: '16px' }}>
        Hack with Hyderabad 3.0 &bull; AI Agents That Learn Using Hindsight
      </div>

      <h1>Incident response that remembers.</h1>

      <p className="lead">
        SentinelMind is a multi-agent autonomous SRE team powered by <strong>Vectorize Hindsight</strong>.
        Instead of treating every 3 AM outage like the first time, SentinelMind recalls past root causes,
        prioritizes proven fixes, skips dead ends, and auto-rolls back harmful actions.
      </p>

      <div className="hero-actions">
        <button className="btn" onClick={onGoToWarRoom} style={{ padding: '0 24px' }}>
          Open War Room
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRunDemoFlow}
          disabled={isDemoRunning}
          style={{ padding: '0 24px' }}
        >
          {isDemoRunning ? 'Running Demo Flow...' : 'Launch 60-Second Demo'}
        </button>
      </div>

      <div className="feature-grid">
        <div className="card">
          <div className="lbl" style={{ color: 'var(--am)' }}>
            1. PERSISTENT HINDSIGHT MEMORY
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mu)', margin: '8px 0 0' }}>
            Retains structured facts on what succeeded, failed, or worsened. Recalls on symptoms and logs; reflects to synthesize root-cause playbooks.
          </p>
        </div>

        <div className="card">
          <div className="lbl" style={{ color: 'var(--te)' }}>
            2. AUTO-ROLLBACK & SAFEGUARDS
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mu)', margin: '8px 0 0' }}>
            Allow-listed catalogs with risk gating. High-risk actions halt for human approval; worsening telemetry triggers immediate rollback.
          </p>
        </div>

        <div className="card">
          <div className="lbl" style={{ color: 'var(--tx)' }}>
            3. COMPUTED CONFIDENCE BLEND
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mu)', margin: '8px 0 0' }}>
            Combines model reasoning with Laplace-smoothed historical success rates: <code>(successes + 1)/(matches + 2)</code> with full mathematical breakdown.
          </p>
        </div>

        <div className="card">
          <div className="lbl" style={{ color: 'var(--te)' }}>
            4. CONTAINERIZED DOCKER RUNTIME
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mu)', margin: '8px 0 0' }}>
            Multi-stage container (Node 20 Alpine + Python 3.11 Slim). Production-grade Docker Compose orchestration with isolated networking, persistent memory volumes (<code>/app/runs</code>), and health probes.
          </p>
        </div>
      </div>
    </div>
  );
};

