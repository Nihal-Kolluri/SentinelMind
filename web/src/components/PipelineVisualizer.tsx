import React from 'react';

const AGENTS = [
  'Sentinel',
  'Triage',
  'Investigator',
  'Planner',
  'Executor',
  'Verifier',
  'Historian',
];

interface PipelineVisualizerProps {
  currentStage?: string;
  isResolved?: boolean;
  isEscalated?: boolean;
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({
  currentStage = '',
  isResolved = false,
  isEscalated = false,
}) => {
  const stageMap: Record<string, number> = {
    detected: 0,
    triaged: 1,
    investigating: 2,
    planned: 3,
    executing: 4,
    verifying: 5,
    historian: 6,
  };

  const currentIndex = stageMap[currentStage.toLowerCase()] ?? (isResolved ? 7 : -1);

  return (
    <div className="pipe" id="pipe" role="region" aria-label="Agent pipeline status">
      {AGENTS.map((agent, i) => {
        let cls = 'ag';
        if (isResolved || i < currentIndex) {
          cls += ' on';
        } else if (i === currentIndex) {
          cls += ' now';
        }

        return (
          <div key={agent} className={cls} id={`ag${i}`}>
            {agent}
            {isEscalated && i === 3 && (
              <span style={{ display: 'block', fontSize: '10px', color: 'var(--co)' }}>
                Escalated
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

