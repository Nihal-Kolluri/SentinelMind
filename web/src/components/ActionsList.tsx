import React from 'react';

interface ActionEntry {
  action: string;
  status: 'ok' | 'worse' | 'no';
}

interface ActionsListProps {
  tried: string[];
  succeeded: string[];
  worsened: string[];
}

export const ActionsList: React.FC<ActionsListProps> = ({
  tried,
  succeeded,
  worsened,
}) => {
  const actions: ActionEntry[] = tried.map((act) => {
    if (succeeded.includes(act)) {
      return { action: act, status: 'ok' };
    }
    if (worsened.includes(act)) {
      return { action: act, status: 'worse' };
    }
    return { action: act, status: 'no' };
  });

  return (
    <div className="card">
      <div className="lbl">ACTIONS TRIED</div>
      <div id="acts">
        {actions.length === 0 ? (
          <div className="empty">No remediation actions executed yet.</div>
        ) : (
          actions.map((act, i) => {
            const badge =
              act.status === 'ok'
                ? { label: 'Resolved', cls: 'ok' }
                : act.status === 'worse'
                ? { label: 'Worse, rolled back', cls: 'no' }
                : { label: 'No effect', cls: 'no' };

            return (
              <div key={i} className="step" style={{ padding: '10px 0' }}>
                <span className="mono" style={{ flex: 1, fontSize: '15px', fontWeight: 700 }}>
                  {act.action}
                </span>
                <i className={badge.cls} style={{ fontSize: '13px', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                  {badge.label}
                </i>
              </div>

            );
          })
        )}
      </div>
    </div>
  );
};
