import React, { useState } from 'react';

export const WhatIfSlider: React.FC = () => {
  const [matches, setMatches] = useState<number>(3);
  const [successRate, setSuccessRate] = useState<number>(90);
  const [hourlyCost, setHourlyCost] = useState<number>(6000);

  // Exact SentinelMind confidence blend formula:
  // history_score = (successes + 1) / (matches + 2)
  // final_confidence = 0.5 * model_confidence (0.75) + 0.5 * history_score
  const successes = Math.round(matches * (successRate / 100));
  const historyScore = (successes + 1) / (matches + 2);
  const modelConf = 0.78;
  const finalConfidence = 0.5 * modelConf + 0.5 * historyScore;
  const confidencePct = Math.min(99, Math.round(finalConfidence * 100));

  // MTTR estimation:
  // Cold baseline is 18.0 minutes. Each matching incident with high success reduces MTTR logarithmically down to ~4.5 min.
  const coldMinutes = 18.0;
  const accelerationFactor = matches === 0 ? 0 : Math.min(0.75, (matches / (matches + 1.2)) * (successRate / 100));
  const predictedMinutes = Math.max(4.2, Math.round((coldMinutes * (1 - accelerationFactor)) * 10) / 10);
  const timeSavedMinutes = Math.max(0, Math.round((coldMinutes - predictedMinutes) * 10) / 10);
  const timeSavedPct = Math.round((timeSavedMinutes / coldMinutes) * 100);

  // Downtime cost saved calculation:
  const costSaved = Math.round((timeSavedMinutes / 60) * hourlyCost);

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', marginBottom: '8px' }}>
        <div className="lbl" style={{ color: 'var(--am)', margin: 0 }}>
          WHAT-IF: HINDSIGHT ACCELERATION SIMULATOR
        </div>
        <span
          className="mono"
          style={{
            fontSize: '11px',
            background: 'var(--teb)',
            color: 'var(--te)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700,
          }}
        >
          -{timeSavedPct}% MTTR
        </span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--mu)', margin: '0 0 12px', lineHeight: 1.4 }}>
        Simulate how agent MTTR, confidence, and downtime savings scale dynamically as Hindsight retains more operational memories:
      </p>

      {/* Control 1: Similar Past Incidents */}
      <div style={{ marginBottom: '10px' }}>
        <div className="row" style={{ fontSize: '12px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--tx)' }}>Similar Incidents in Hindsight Bank:</span>
          <b className="mono" style={{ color: 'var(--am)', fontSize: '13px' }}>
            {matches} {matches === 1 ? 'incident' : 'incidents'}
          </b>
        </div>
        <input
          type="range"
          min="0"
          max="10"
          value={matches}
          onChange={(e) => setMatches(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--am)' }}
          aria-label="Number of similar past incidents"
        />
      </div>

      {/* Control 2: Success Rate */}
      <div style={{ marginBottom: '10px' }}>
        <div className="row" style={{ fontSize: '12px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--tx)' }}>Historical Fix Reliability:</span>
          <b className="mono" style={{ color: 'var(--te)', fontSize: '13px' }}>
            {successRate}%
          </b>
        </div>
        <input
          type="range"
          min="50"
          max="100"
          step="5"
          value={successRate}
          onChange={(e) => setSuccessRate(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--te)' }}
          aria-label="Historical fix success rate"
        />
      </div>

      {/* Control 3: Cost of Downtime */}
      <div style={{ marginBottom: '10px' }}>
        <div className="row" style={{ fontSize: '12px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--tx)' }}>Estimated Downtime Cost / Hour:</span>
          <b className="mono" style={{ color: 'var(--tx)', fontSize: '13px' }}>
            ${hourlyCost.toLocaleString()}/hr
          </b>
        </div>
        <input
          type="range"
          min="1000"
          max="20000"
          step="1000"
          value={hourlyCost}
          onChange={(e) => setHourlyCost(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--mu)' }}
          aria-label="Cost of downtime per hour"
        />
      </div>

      {/* Dynamic Results Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '10px',
          marginTop: '10px',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
            Predicted MTTR
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--tx)' }}>
              {predictedMinutes}m
            </span>
            <small style={{ color: 'var(--mu)', fontSize: '11px', textDecoration: 'line-through' }}>
              18m
            </small>
          </div>
        </div>

        <div>
          <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
            Agent Confidence
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--am)' }}>
              {confidencePct}%
            </span>
            <small style={{ color: 'var(--mu)', fontSize: '11px' }}>
              blend
            </small>
          </div>
        </div>

        <div>
          <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
            Downtime Averted
          </span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--te)' }}>
            +{timeSavedMinutes} min
          </span>
        </div>

        <div>
          <span style={{ fontSize: '10px', color: 'var(--mu)', display: 'block', textTransform: 'uppercase' }}>
            Est. Cost Saved
          </span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx)' }}>
            ${costSaved.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Formula & Rule Note */}
      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--mu)', lineHeight: 1.4 }}>
        <strong>Laplace Smoothing:</strong> ({successes} + 1) / ({matches} + 2) = {Math.round(historyScore * 100)}% prior weighting.
        {matches > 0 && ' Harmful trial-and-error actions skipped.'}
      </div>
    </div>
  );
};
