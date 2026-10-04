import React, { useState } from 'react';
import { ActionableRecommendationsCard } from './ActionableRecommendationsCard';
import { ActionsList } from './ActionsList';
import { AgentReasoningView } from './AgentReasoningView';
import { AgentLogStream } from './AgentLogStream';
import { ActionableRecommendation, AgentReasoningStep } from '../types';

interface ActionTabsProps {
  recommendations?: ActionableRecommendation[];
  tried: string[];
  succeeded: string[];
  worsened: string[];
  agentReasoning: AgentReasoningStep[];
  agentLogs: string[];
  currentStage?: string;
  isResolved?: boolean;
}

export const ActionTabs: React.FC<ActionTabsProps> = ({
  recommendations = [],
  tried = [],
  succeeded = [],
  worsened = [],
  agentReasoning = [],
  agentLogs = [],
  currentStage,
  isResolved,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'recs' | 'executed' | 'reasoning' | 'logs'>('recs');

  const recCount = recommendations.length;
  const executedCount = tried.length;
  const reasoningCount = agentReasoning.length;
  const logCount = agentLogs.length;

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      {/* Sub-Tab Navigation Header */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--line)',
          background: 'rgba(0, 0, 0, 0.2)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
        role="tablist"
        aria-label="Incident actions and reasoning tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'recs'}
          onClick={() => setActiveSubTab('recs')}
          style={{
            flex: 1,
            minHeight: '48px',
            padding: '12px 18px',
            background: activeSubTab === 'recs' ? 'var(--card)' : 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'recs' ? '2.5px solid var(--am)' : '2.5px solid transparent',
            color: activeSubTab === 'recs' ? 'var(--tx)' : 'var(--mu)',
            font: 'inherit',
            fontSize: '15px',
            fontWeight: activeSubTab === 'recs' ? 700 : 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span>Recommended Fixes</span>
          {recCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: activeSubTab === 'recs' ? 'var(--amb)' : 'var(--line)',
                color: activeSubTab === 'recs' ? 'var(--am)' : 'var(--mu)',
                fontWeight: 700,
              }}
            >
              {recCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'executed'}
          onClick={() => setActiveSubTab('executed')}
          style={{
            flex: 1,
            minHeight: '48px',
            padding: '12px 18px',
            background: activeSubTab === 'executed' ? 'var(--card)' : 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'executed' ? '2.5px solid var(--te)' : '2.5px solid transparent',
            color: activeSubTab === 'executed' ? 'var(--tx)' : 'var(--mu)',
            font: 'inherit',
            fontSize: '15px',
            fontWeight: activeSubTab === 'executed' ? 700 : 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span>Actions Executed</span>
          {executedCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: isResolved ? 'var(--teb)' : 'var(--line)',
                color: isResolved ? 'var(--te)' : 'var(--mu)',
                fontWeight: 700,
              }}
            >
              {executedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'reasoning'}
          onClick={() => setActiveSubTab('reasoning')}
          style={{
            flex: 1,
            minHeight: '48px',
            padding: '12px 18px',
            background: activeSubTab === 'reasoning' ? 'var(--card)' : 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'reasoning' ? '2.5px solid #B388FF' : '2.5px solid transparent',
            color: activeSubTab === 'reasoning' ? 'var(--tx)' : 'var(--mu)',
            font: 'inherit',
            fontSize: '15px',
            fontWeight: activeSubTab === 'reasoning' ? 700 : 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2a8 8 0 0 0-8 8c0 3.31 2.01 6.16 4.9 7.37L9 22h6l.1-4.63A8.003 8.003 0 0 0 12 2z" />
          </svg>
          <span>Agent Reasoning Trace</span>
          {reasoningCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(179, 136, 255, 0.15)',
                color: '#B388FF',
                fontWeight: 700,
              }}
            >
              {reasoningCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'logs'}
          onClick={() => setActiveSubTab('logs')}
          style={{
            flex: 1,
            minHeight: '48px',
            padding: '12px 18px',
            background: activeSubTab === 'logs' ? 'var(--card)' : 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'logs' ? '2.5px solid var(--tx)' : '2.5px solid transparent',
            color: activeSubTab === 'logs' ? 'var(--tx)' : 'var(--mu)',
            font: 'inherit',
            fontSize: '15px',
            fontWeight: activeSubTab === 'logs' ? 700 : 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Console Stream</span>
          {logCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--line)',
                color: 'var(--tx)',
                fontWeight: 700,
              }}
            >
              {logCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div style={{ padding: '16px' }}>
        {activeSubTab === 'recs' && (
          <ActionableRecommendationsCard
            recommendations={recommendations}
            tried={tried}
            succeeded={succeeded}
            worsened={worsened}
          />
        )}

        {activeSubTab === 'executed' && (
          <ActionsList
            tried={tried}
            succeeded={succeeded}
            worsened={worsened}
          />
        )}

        {activeSubTab === 'reasoning' && (
          <AgentReasoningView
            steps={agentReasoning}
            currentStage={currentStage}
          />
        )}

        {activeSubTab === 'logs' && (
          <AgentLogStream logs={agentLogs} />
        )}
      </div>
    </div>
  );
};
