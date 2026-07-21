import { Site } from '../types';

interface StatsBarProps {
  sites: Site[];
}

export default function StatsBar({ sites }: StatsBarProps) {
  const total = sites.length;
  const online = sites.filter(s => s.latestCheck?.status === 'online').length;
  const offline = sites.filter(s => s.latestCheck?.status === 'offline').length;
  const avgResponseTime = sites.reduce((acc, s) => {
    if (s.latestCheck?.response_time) return acc + s.latestCheck.response_time;
    return acc;
  }, 0);
  const sitesWithResponse = sites.filter(s => s.latestCheck?.response_time).length;
  const avgTime = sitesWithResponse > 0 ? Math.round(avgResponseTime / sitesWithResponse) : 0;

  const stats = [
    { label: 'Total Sites', value: total, color: 'text-white' },
    { label: 'Online', value: online, color: 'text-green-400' },
    { label: 'Offline', value: offline, color: 'text-red-400' },
    { label: 'Avg Response', value: `${avgTime}ms`, color: 'text-accent' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {stats.map(stat => (
        <div
          key={stat.label}
          className="bg-navy-surface border border-border rounded-xl p-4 text-center hover:border-accent/40 transition-colors duration-200"
        >
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
          <p className={`text-2xl font-heading font-bold ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
