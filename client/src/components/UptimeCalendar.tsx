import { useEffect, useState } from 'react';
import { Check } from '../types';
import { apiUrl } from '../api';

interface UptimeCalendarProps {
  siteId: number;
  days?: 7 | 30;
}

interface DayData {
  date: string;
  uptime: number;
  checks: number;
}

export default function UptimeCalendar({ siteId, days = 30 }: UptimeCalendarProps) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/sites/${siteId}/history`))
      .then(res => res.json())
      .then((history: Check[]) => {
        const daysAgo = Date.now() - days * 24 * 60 * 60 * 1000;
        const filtered = history.filter(h => new Date(h.checked_at + 'Z').getTime() > daysAgo);

        // Günlərə qruplama
        const byDay = new Map<string, { online: number; total: number }>();
        filtered.forEach(check => {
          const date = new Date(check.checked_at + 'Z').toISOString().split('T')[0];
          if (!byDay.has(date)) {
            byDay.set(date, { online: 0, total: 0 });
          }
          const day = byDay.get(date)!;
          day.total++;
          if (check.status === 'online') day.online++;
        });

        // Bütün günləri doldur
        const result: DayData[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const dateStr = date.toISOString().split('T')[0];
          const dayData = byDay.get(dateStr);
          result.push({
            date: dateStr,
            uptime: dayData ? (dayData.online / dayData.total) * 100 : 0,
            checks: dayData?.total || 0,
          });
        }

        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [siteId, days]);

  if (loading) {
    return <p className="text-text-muted text-sm">Loading...</p>;
  }

  const getColor = (uptime: number) => {
    if (uptime === 0) return 'bg-navy-light';
    if (uptime < 50) return 'bg-red-400/30';
    if (uptime < 90) return 'bg-yellow-400/30';
    if (uptime < 99) return 'bg-green-400/30';
    return 'bg-green-400';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{days} Days Uptime</span>
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-navy-light"></div>
            <div className="w-3 h-3 rounded-sm bg-red-400/30"></div>
            <div className="w-3 h-3 rounded-sm bg-yellow-400/30"></div>
            <div className="w-3 h-3 rounded-sm bg-green-400/30"></div>
            <div className="w-3 h-3 rounded-sm bg-green-400"></div>
          </div>
          <span>More</span>
        </div>
      </div>
      <div className={`grid gap-1 ${days === 7 ? 'grid-cols-7' : 'grid-cols-6 sm:grid-cols-10'}`}>
        {data.map((day, i) => (
          <div
            key={i}
            className={`aspect-square rounded-sm ${getColor(day.uptime)} relative group cursor-pointer transition-transform hover:scale-110`}
            title={`${day.date}: ${day.uptime.toFixed(1)}% (${day.checks} checks)`}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-navy-light border border-border rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              <br />
              {day.uptime.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
