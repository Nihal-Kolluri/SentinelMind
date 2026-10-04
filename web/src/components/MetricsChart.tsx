import React from 'react';

interface MetricsChartProps {
  coldMinutes: number;
  warmMinutes: number | null;
  isWarm: boolean;
}

export const MetricsChart: React.FC<MetricsChartProps> = ({
  coldMinutes,
  warmMinutes,
  isWarm,
}) => {
  const effectiveCold = coldMinutes > 0 ? coldMinutes : 17;
  const effectiveWarm = warmMinutes ?? 6;
  const maxMin = Math.max(effectiveCold, effectiveWarm);

  return (
    <div className="card">
      <div className="lbl">TIME TO RESOLVE</div>
      <div id="chart">
        <div className="row">
          <span style={{ fontSize: '13px', color: 'var(--mu)' }}>Without memory</span>
          <b className="mono">{effectiveCold} min</b>
        </div>
        <div className="bar">
          <span
            style={{
              width: `${(effectiveCold / maxMin) * 100}%`,
              background: 'var(--mu)',
            }}
          />
        </div>

        {isWarm ? (
          <>
            <div className="row" style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--mu)' }}>With memory</span>
              <b className="mono">{effectiveWarm} min</b>
            </div>
            <div className="bar">
              <span
                style={{
                  width: `${(effectiveWarm / maxMin) * 100}%`,
                  background: 'var(--te)',
                }}
              />
            </div>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--mu)', marginTop: '8px' }}>
            First of its kind. Its outcome becomes memory for the next one.
          </div>
        )}
      </div>
    </div>
  );
};
