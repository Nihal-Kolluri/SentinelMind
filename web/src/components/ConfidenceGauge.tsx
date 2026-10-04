import React from 'react';
import { ConfidenceBreakdown } from '../types';

interface ConfidenceGaugeProps {
  confidence: number;
  breakdown?: ConfidenceBreakdown | null;
}

export const ConfidenceGauge: React.FC<ConfidenceGaugeProps> = ({
  confidence,
  breakdown,
}) => {
  const pct = Math.round(confidence * 100);
  const modelPct = breakdown ? Math.round(breakdown.model_confidence * 100) : 70;
  const histPct = breakdown ? Math.round(breakdown.history_score * 100) : 50;
  const successes = breakdown?.successes ?? 0;
  const matches = breakdown?.matches ?? 0;

  return (
    <div className="card">
      <div className="lbl">CONFIDENCE</div>
      <div className="big" id="conf">
        {pct}%
      </div>
      <div className="bar">
        <span
          id="cbar"
          style={{
            width: `${pct}%`,
            background: 'var(--te)',
          }}
        />
      </div>
      <div style={{ fontSize: '13px', color: 'var(--mu)' }} id="cwhy">
        {breakdown?.explanation ||
          `Blend of model confidence (${modelPct}%) and history-based success rate (${histPct}%, ${successes} of ${matches} similar past fixes).`}
      </div>
    </div>
  );
};
