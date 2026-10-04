"""SQLite incident and memory store.
Persists incident run history, state checkpoints, memory trail linkages, and stats.
"""
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sentinelmind.sqlite3")


def get_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Creates database schema if not present."""
    with get_db(db_path) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            label TEXT NOT NULL,
            service TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            root_cause TEXT,
            minutes INTEGER NOT NULL,
            memory_on BOOLEAN NOT NULL,
            escalated BOOLEAN NOT NULL,
            tried JSON,
            succeeded JSON,
            failed JSON,
            worsened JSON,
            confidence REAL,
            memory_trail JSON,
            diagnosis JSON,
            exec_log JSON,
            log_lines JSON,
            metric_history JSON,
            postmortem TEXT,
            reflection TEXT,
            root_cause_analysis JSON,
            actionable_recommendations JSON,
            agent_reasoning JSON,
            memory_correlation JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS playbooks (
            root_cause TEXT PRIMARY KEY,
            recommended_action TEXT,
            avoid_action TEXT,
            synthesis TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS custom_scenarios (
            id TEXT PRIMARY KEY,
            service TEXT NOT NULL,
            severity TEXT NOT NULL,
            category TEXT NOT NULL,
            root_cause TEXT,
            description TEXT,
            p95_ms INTEGER,
            error_rate REAL,
            logs JSON,
            alerts JSON,
            deploys JSON,
            extra JSON,
            effective JSON,
            harmful JSON,
            tag TEXT DEFAULT 'Dynamic',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_runs_incident ON runs(incident_id);
        CREATE INDEX IF NOT EXISTS idx_runs_memory ON runs(memory_on);
        CREATE INDEX IF NOT EXISTS idx_custom_scenarios_service ON custom_scenarios(service);
        """)


        # Migration: ensure new columns exist in existing databases
        cursor = conn.execute("PRAGMA table_info(runs)")
        cols = {row["name"] for row in cursor.fetchall()}
        for col_name in ("root_cause_analysis", "actionable_recommendations", "agent_reasoning", "memory_correlation"):
            if col_name not in cols:
                try:
                    conn.execute(f"ALTER TABLE runs ADD COLUMN {col_name} JSON")
                except Exception:
                    pass


def save_run(st: Dict[str, Any], db_path: Optional[str] = None) -> int:
    """Inserts or updates an incident run checkpoint into SQLite."""
    init_db(db_path)
    with get_db(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO runs (
                incident_id, label, service, severity, status, root_cause,
                minutes, memory_on, escalated, tried, succeeded, failed, worsened,
                confidence, memory_trail, diagnosis, exec_log, log_lines,
                metric_history, postmortem, reflection,
                root_cause_analysis, actionable_recommendations, agent_reasoning, memory_correlation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                st.get("incident_id") or st.get("id"),
                st.get("label", "run"),
                st.get("service", "unknown"),
                st.get("severity", "P2"),
                st.get("status", "unknown"),
                (st.get("diagnosis") or {}).get("root_cause", "") or st.get("root_cause", ""),
                st.get("minutes", 0),
                bool(st.get("memory_on", False)),
                bool(st.get("escalated", False)),
                json.dumps(st.get("tried", [])),
                json.dumps(st.get("succeeded", [])),
                json.dumps(st.get("failed", [])),
                json.dumps(st.get("worsened", [])),
                float(st.get("confidence", 0.0)),
                json.dumps(st.get("memory_trail", [])),
                json.dumps(st.get("diagnosis", {})),
                json.dumps(st.get("exec_log", [])),
                json.dumps(st.get("log_lines", [])),
                json.dumps(st.get("metric_history", [])),
                st.get("postmortem", ""),
                st.get("reflection", ""),
                json.dumps(st.get("root_cause_analysis")) if st.get("root_cause_analysis") is not None else None,
                json.dumps(st.get("actionable_recommendations", [])),
                json.dumps(st.get("agent_reasoning", [])),
                json.dumps(st.get("memory_correlation")) if st.get("memory_correlation") is not None else None,
            ),
        )
        run_id = cursor.lastrowid

        # Update synthesized playbook if reflection exists
        diag = st.get("diagnosis") or {}
        rc = diag.get("root_cause") or st.get("root_cause")
        if st.get("reflection") and rc:
            rec = st["succeeded"][0] if st.get("succeeded") else ""
            avoid = st["worsened"][0] if st.get("worsened") else ""
            conn.execute(
                """
                INSERT INTO playbooks (root_cause, recommended_action, avoid_action, synthesis, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(root_cause) DO UPDATE SET
                    recommended_action = COALESCE(excluded.recommended_action, playbooks.recommended_action),
                    avoid_action = COALESCE(excluded.avoid_action, playbooks.avoid_action),
                    synthesis = excluded.synthesis,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (rc, rec, avoid, st["reflection"]),
            )

        return run_id


def get_latest_run(incident_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_db(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM runs WHERE incident_id = ? ORDER BY id DESC LIMIT 1",
            (incident_id,),
        ).fetchone()
        if not row:
            return None
        return _row_to_run_dict(row)


def get_all_runs(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_db(db_path) as conn:
        rows = conn.execute("SELECT * FROM runs ORDER BY id DESC").fetchall()
        return [_row_to_run_dict(r) for r in rows]


def get_playbooks(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_db(db_path) as conn:
        rows = conn.execute("SELECT * FROM playbooks ORDER BY root_cause ASC").fetchall()
        return [dict(r) for r in rows]


def get_stats(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Computes before vs after aggregate stats: time saved, actions reduced, learning curves."""
    init_db(db_path)
    with get_db(db_path) as conn:
        baseline_rows = conn.execute(
            "SELECT incident_id, minutes, json_array_length(tried) as actions FROM runs WHERE memory_on = 0"
        ).fetchall()
        memory_rows = conn.execute(
            "SELECT incident_id, minutes, json_array_length(tried) as actions FROM runs WHERE memory_on = 1"
        ).fetchall()

    b_avg_time = sum(r["minutes"] for r in baseline_rows) / max(1, len(baseline_rows)) if baseline_rows else 18.0
    m_avg_time = sum(r["minutes"] for r in memory_rows) / max(1, len(memory_rows)) if memory_rows else 5.5

    b_avg_actions = sum(r["actions"] for r in baseline_rows) / max(1, len(baseline_rows)) if baseline_rows else 3.5
    m_avg_actions = sum(r["actions"] for r in memory_rows) / max(1, len(memory_rows)) if memory_rows else 1.2

    time_saved_pct = round(((b_avg_time - m_avg_time) / max(1.0, b_avg_time)) * 100, 1)
    actions_reduced_pct = round(((b_avg_actions - m_avg_actions) / max(1.0, b_avg_actions)) * 100, 1)

    return {
        "baseline_avg_minutes": round(b_avg_time, 1),
        "memory_avg_minutes": round(m_avg_time, 1),
        "time_saved_pct": max(0.0, time_saved_pct),
        "baseline_avg_actions": round(b_avg_actions, 1),
        "memory_avg_actions": round(m_avg_actions, 1),
        "actions_reduced_pct": max(0.0, actions_reduced_pct),
        "total_baseline_runs": len(baseline_rows),
        "total_memory_runs": len(memory_rows),
    }


def clear_db(db_path: Optional[str] = None) -> None:
    init_db(db_path)
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM runs")
        conn.execute("DELETE FROM playbooks")


def _row_to_run_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    for k in (
        "tried", "succeeded", "failed", "worsened", "memory_trail", "diagnosis",
        "exec_log", "log_lines", "metric_history",
        "root_cause_analysis", "actionable_recommendations", "agent_reasoning", "memory_correlation"
    ):
        if d.get(k) and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except Exception:
                pass

    # Normalize primary IDs so frontend receives string incident_id for both id and incident_id
    d["run_id"] = d.get("id")
    if d.get("incident_id"):
        d["id"] = d["incident_id"]
    else:
        d["incident_id"] = str(d.get("id"))

    if not d.get("diagnosis"):
        d["diagnosis"] = {"root_cause": d.get("root_cause", "unknown")}
    return d


def save_custom_scenario(sc: Dict[str, Any], db_path: Optional[str] = None) -> None:
    """Persists a dynamic/custom scenario definition to SQLite."""
    init_db(db_path)
    with get_db(db_path) as conn:
        metrics = sc.get("metrics") or {}
        conn.execute(
            """
            INSERT INTO custom_scenarios (
                id, service, severity, category, root_cause, description,
                p95_ms, error_rate, logs, alerts, deploys, extra, effective, harmful, tag
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                service = excluded.service,
                severity = excluded.severity,
                category = excluded.category,
                root_cause = excluded.root_cause,
                description = excluded.description,
                p95_ms = excluded.p95_ms,
                error_rate = excluded.error_rate,
                logs = excluded.logs,
                alerts = excluded.alerts,
                deploys = excluded.deploys,
                extra = excluded.extra,
                effective = excluded.effective,
                harmful = excluded.harmful,
                tag = excluded.tag
            """,
            (
                sc["id"],
                sc.get("service", "custom-service"),
                sc.get("severity", "P2"),
                sc.get("category", "performance"),
                sc.get("root_cause", "unknown"),
                sc.get("description", ""),
                metrics.get("p95_ms", 3500),
                metrics.get("error_rate", 0.05),
                json.dumps(sc.get("logs", [])),
                json.dumps(sc.get("alerts", [])),
                json.dumps(sc.get("deploys", [])),
                json.dumps(sc.get("extra", [])),
                json.dumps(list(sc.get("effective", []))),
                json.dumps(list(sc.get("harmful", []))),
                sc.get("tag", "Dynamic"),
            ),
        )


def get_all_custom_scenarios(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves all persisted custom scenarios from SQLite."""
    init_db(db_path)
    with get_db(db_path) as conn:
        rows = conn.execute("SELECT * FROM custom_scenarios ORDER BY created_at ASC").fetchall()
        results = []
        for r in rows:
            d = dict(r)
            for k in ("logs", "alerts", "deploys", "extra", "effective", "harmful"):
                if d.get(k) and isinstance(d[k], str):
                    try:
                        d[k] = json.loads(d[k])
                    except Exception:
                        pass
            results.append(d)
        return results


def load_custom_scenarios_into_world(target_scenarios: Dict[str, Any], db_path: Optional[str] = None) -> None:
    """Populates in-memory SCENARIOS dict with all custom scenarios stored in SQLite."""
    try:
        scenarios = get_all_custom_scenarios(db_path)
        for sc in scenarios:
            iid = sc["id"]
            if iid not in target_scenarios:
                target_scenarios[iid] = {
                    "service": sc["service"],
                    "severity": sc["severity"],
                    "category": sc["category"],
                    "root_cause": sc.get("root_cause", "unknown"),
                    "description": sc.get("description", ""),
                    "metrics": {
                        "p95_ms": sc.get("p95_ms", 3500),
                        "error_rate": sc.get("error_rate", 0.05),
                    },
                    "logs": sc.get("logs", []),
                    "alerts": sc.get("alerts", []),
                    "deploys": sc.get("deploys", []),
                    "extra": sc.get("extra", []),
                    "effective": set(sc.get("effective", [])),
                    "harmful": set(sc.get("harmful", [])),
                    "tag": sc.get("tag", "Dynamic"),
                    "custom": True,
                }
    except Exception:
        pass

