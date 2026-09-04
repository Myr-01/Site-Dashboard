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
    {
      label: 'Total Sites',
      value: total,
      valueColor: 'text-white',
      topBorder: 'border-t-accent',
      hoverBorder: 'hover:border-accent/50',
      iconColor: 'text-accent',
      iconBg: 'bg-accent/15',
      iconBorder: 'border-accent/30',
      glow: 'bg-accent',
      iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18a15 15 0 010-18z',
    },
    {
      label: 'Online',
      value: online,
      valueColor: 'text-green-400',
      topBorder: 'border-t-green-400',
      hoverBorder: 'hover:border-green-400/50',
      iconColor: 'text-green-400',
      iconBg: 'bg-green-400/15',
      iconBorder: 'border-green-400/30',
      glow: 'bg-green-400',
      iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Offline',
      value: offline,
      valueColor: offline > 0 ? 'text-red-400' : 'text-white',
      topBorder: offline > 0 ? 'border-t-red-400' : 'border-t-border',
      hoverBorder: offline > 0 ? 'hover:border-red-400/50' : 'hover:border-text-muted/40',
      iconColor: offline > 0 ? 'text-red-400' : 'text-text-muted',
      iconBg: offline > 0 ? 'bg-red-400/15' : 'bg-navy-light',
      iconBorder: offline > 0 ? 'border-red-400/30' : 'border-border',
      glow: 'bg-red-400',
      iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Avg Response',
      value: `${avgTime}ms`,
      valueColor: 'text-accent',
      topBorder: 'border-t-blue-400',
      hoverBorder: 'hover:border-blue-400/50',
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-400/15',
      iconBorder: 'border-blue-400/30',
      glow: 'bg-blue-400',
      iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {stats.map(stat => (
        <div
          key={stat.label}
          className={`group relative bg-navy-surface border border-border border-t-2 ${stat.topBorder} ${stat.hoverBorder} rounded-2xl p-5 overflow-hidden transition-colors`}
        >
          {/* Arxa fon glow */}
          <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-10 ${stat.glow}`} />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-text-muted text-[11px] uppercase tracking-wider mb-2 truncate">{stat.label}</p>
              <p className={`text-4xl md:text-[2.75rem] font-heading font-bold leading-none tracking-tight ${stat.valueColor}`}>{stat.value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg} border ${stat.iconBorder} transition-transform group-hover:scale-110`}>
              <svg className={`w-6 h-6 ${stat.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.iconPath} />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
