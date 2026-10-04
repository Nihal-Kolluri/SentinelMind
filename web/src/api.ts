import { HealthStatus, Incident, IncidentRun, Playbook, SystemStats } from './types';

const API_BASE = '/api';

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(`${API_BASE}/incidents`);
  if (!res.ok) throw new Error(`Failed to fetch incidents: ${res.statusText}`);
  return res.json();
}

export async function fetchIncident(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/incidents/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch incident ${id}: ${res.statusText}`);
  return res.json();
}

export async function triggerRun(id: string, memoryOn: boolean): Promise<any> {
  const res = await fetch(`${API_BASE}/incidents/${id}/run?memory=${memoryOn ? 'on' : 'off'}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to trigger incident ${id}: ${res.statusText}`);
  return res.json();
}

export async function fetchPlaybooks(): Promise<Playbook[]> {
  const res = await fetch(`${API_BASE}/memory/playbooks`);
  if (!res.ok) throw new Error(`Failed to fetch playbooks: ${res.statusText}`);
  return res.json();
}

export async function fetchStats(): Promise<SystemStats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Failed to fetch health status: ${res.statusText}`);
  return res.json();
}

export async function resetDemo(): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to reset demo: ${res.statusText}`);
  return res.json();
}

export async function seedDemo(): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/seed`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to seed demo: ${res.statusText}`);
  return res.json();
}

export async function killExecution(id?: string): Promise<any> {
  const url = id ? `${API_BASE}/kill?incident_id=${id}` : `${API_BASE}/kill`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to trigger kill switch: ${res.statusText}`);
  return res.json();
}

export interface CustomIncidentPayload {
  service: string;
  severity: string;
  category: string;
  description?: string;
  p95_ms?: number;
  error_rate?: number;
  logs?: string[];
  alerts?: string[];
  deploys?: string[];
  root_cause?: string;
  effective_action?: string;
  raw_payload?: string;
  memory_on?: boolean;
  run_immediately?: boolean;
}

export async function analyzeCustomIncident(payload: CustomIncidentPayload): Promise<any> {
  const res = await fetch(`${API_BASE}/incidents/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to analyze custom incident: ${res.statusText}`);
  return res.json();
}

export function subscribeIncidentStream(
  id: string,
  onEvent: (event: string, data: any) => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/incidents/${id}/stream`);

  eventSource.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      if (parsed.event && parsed.event !== 'ping') {
        onEvent(parsed.event, parsed.data);
      }
    } catch (err) {
      console.error('Error parsing SSE event:', err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

export async function fetchRunHistory(
  limit: number = 50,
  service?: string,
  memoryOnly?: boolean
): Promise<IncidentRun[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (service) params.set('service', service);
  if (memoryOnly !== undefined) params.set('memory_only', String(memoryOnly));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/history${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch history: ${res.statusText}`);
  return res.json();
}
