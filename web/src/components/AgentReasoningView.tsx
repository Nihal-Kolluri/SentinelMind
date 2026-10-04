import React, { useState } from 'react';
import { AgentReasoningStep } from '../types';

interface AgentReasoningViewProps {
  steps?: AgentReasoningStep[];
  currentStage?: string;
}

export const AgentReasoningView: React.FC<AgentReasoningViewProps> = ({
  steps = [],
  currentStage,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (steps.length === 0) {
    return (
      <div className="card">
        <div className="lbl" style={{ color: 'var(--am)' }}>
          AGENT REASONING TRACE
        </div>
        <div className="empty">
          Agent swarm reasoning will appear here in real-time as each agent thinks and acts.
        </div>
      </div>
    );
  }

  const getAgentColor = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'sentinel':
        return 'var(--mu)';
      case 'triage':
        return 'var(--am)';
      case 'investigator':
        return 'var(--te)';
      case 'planner':
        return 'var(--am)';
      case 'executor':
        return 'var(--tx)';
      case 'verifier':
        return 'var(--te)';
      case 'historian':
        return '#B388FF';
      default:
        return 'var(--mu)';
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', marginBottom: '8px' }}>
        <div className="lbl" style={{ color: 'var(--am)', margin: 0 }}>
          AGENT REASONING TRACE ({steps.length} STEPS)
        </div>
        <span style={{ fontSize: '11px', color: 'var(--mu)' }}>
          Transparent Multi-Agent Thought Process
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
        {steps.map((s, idx) => {
          const isExpanded = expandedIndex === idx || expandedIndex === null;
          const agentCol = getAgentColor(s.agent);
          const isActive = currentStage && s.agent.toLowerCase() === currentStage.toLowerCase();

          return (
            <div
              key={idx}
              style={{
                background: 'var(--bg)',
                border: isActive ? `1px solid ${agentCol}` : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '10px 12px',
                borderLeft: `3px solid ${agentCol}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setExpandedIndex(expandedIndex === idx ? -1 : idx)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: agentCol,
                      textTransform: 'uppercase',
                    }}
                  >
                    {s.agent}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--mu)',
                      background: 'var(--card)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    {s.stage}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: agentCol,
                        border: `1px solid ${agentCol}`,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {s.confidence !== undefined && (
                    <span style={{ fontSize: '12px', color: 'var(--mu)' }}>
                      conf: <strong style={{ color: 'var(--tx)' }}>{Math.round(s.confidence * 100)}%</strong>
                    </span>
                  )}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      color: 'var(--mu)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '10px' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      color: 'var(--tx)',
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
                    }}
                  >
                    {s.thought}
                  </p>

                  {s.evidence && s.evidence.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {s.evidence.map((ev, i) => (
                        <span
                          key={i}
                          className="mono"
                          style={{
                            fontSize: '12px',
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            color: 'var(--te)',
                            fontWeight: 600,
                          }}
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
