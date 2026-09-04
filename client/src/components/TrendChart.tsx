import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { apiUrl } from '../api';
import { authHeaders } from '../useAuth';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface TrendChartProps {
  siteId: number;
}

interface DailyStat {
  date: string;
  avg_response_time: number | null;
  uptime_percent: number | null;
  total_checks: number;
}

const RANGES = [7, 30, 90] as const;

export default function TrendChart({ siteId }: TrendChartProps) {
  const [range, setRange] = useState<number>(30);
  const [data, setData] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/sites/${siteId}/trend?days=${range}`), { headers: { ...authHeaders() } })
      .then(res => (res.ok ? res.json() : []))
      .then(d => { if (!cancelled) setData(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setData([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, range]);

  const labels = data.map(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return dt.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit' });
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Uptime (%)',
        data: data.map(d => d.uptime_percent),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y',
      },
      {
        label: 'Cavab müddəti (ms)',
        data: data.map(d => (d.avg_response_time == null ? null : Math.round(d.avg_response_time))),
        borderColor: '#fca311',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y1',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: '#9aa3b8', boxWidth: 10, boxHeight: 10, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: '#14213d',
        titleColor: '#fff',
        bodyColor: '#9aa3b8',
        borderColor: 'rgba(229,229,229,0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            if (ctx.parsed.y == null) return `${ctx.dataset.label}: —`;
            return ctx.dataset.label === 'Uptime (%)'
              ? `Uptime: ${ctx.parsed.y.toFixed(2)}%`
              : `Cavab: ${ctx.parsed.y}ms`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(229, 229, 229, 0.06)' },
        ticks: { color: '#9aa3b8', maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        position: 'left' as const,
        min: 0,
        max: 100,
        grid: { color: 'rgba(229, 229, 229, 0.06)' },
        ticks: { color: '#22c55e', callback: (v: string | number) => `${v}%` },
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: { color: '#fca311', callback: (v: string | number) => `${v}ms` },
      },
    },
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {RANGES.map(d => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              range === d ? 'bg-accent text-bg font-medium' : 'bg-navy-light text-text-muted hover:text-white'
            }`}
          >
            {d} gün
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-text-muted text-sm">Yüklənir...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <p className="text-text-muted text-sm">Hələ kifayət qədər tarixi məlumat yoxdur.</p>
          <p className="text-text-muted/70 text-xs mt-1">
            Gündəlik statistika hər gün bir dəfə hesablanır — ilk qeydlər tamamlanmış gündən sonra görünəcək.
          </p>
        </div>
      ) : (
        <div className="h-48">
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
