import React, { useEffect, useRef } from 'react';

interface AgentLogStreamProps {
  logs: string[];
}

export const AgentLogStream: React.FC<AgentLogStreamProps> = ({ logs }) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="card">
      <div className="lbl">AGENT LOG</div>
      <div className="log mono" id="log" ref={logRef}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--mu)', fontStyle: 'italic' }}>
            Awaiting agent execution... Click Replay to run.
          </div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} dangerouslySetInnerHTML={{ __html: line }} />
          ))
        )}
      </div>
    </div>
  );
};
