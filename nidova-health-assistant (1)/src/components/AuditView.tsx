import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { AuditLog } from '../types';

interface AuditViewProps {
  logs: AuditLog[];
  rulesVersion: string;
}

export function AuditView({ logs, rulesVersion }: AuditViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.actor.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.targetType.toLowerCase().includes(q)
    );
  }, [logs, query]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Security & Clinical Audit Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active deterministic ruleset: <span className="font-mono">{rulesVersion}</span> ·{' '}
            {logs.length} recorded events
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter events..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-4">Actor</th>
              <th className="py-2.5 px-4">Action</th>
              <th className="py-2.5 px-4">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {filtered.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="py-2.5 px-4 text-slate-900">{log.actor}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-800">{log.action}</td>
                <td className="py-2.5 px-4 text-xs text-slate-500">
                  {log.targetType} · {log.targetId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
