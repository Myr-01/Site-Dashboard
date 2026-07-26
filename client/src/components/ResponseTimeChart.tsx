import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { apiUrl } from '../api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ResponseTimeChartProps {
  siteId: number;
}

interface CheckHistory {
  response_time: number | null;
  checked_at: string;
}

export default function ResponseTimeChart({ siteId }: ResponseTimeChartProps) {
  const [data, setData] = useState<CheckHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/sites/${siteId}/history`))
      .then(res => res.json())
      .then((history: CheckHistory[]) => {
        // Son 24 saatlık dataları filtrələ
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filtered = history
          .filter(h => new Date(h.checked_at + 'Z').getTime() > oneDayAgo)
          .reverse();
        setData(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-text-muted text-sm">Loading chart...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-text-muted text-sm">No data available</p>
      </div>
    );
  }

  const chartData = {
    labels: data.map(d => {
      const date = new Date(d.checked_at + 'Z');
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }),
    datasets: [
      {
        label: 'Response Time (ms)',
        data: data.map(d => d.response_time || 0),
        borderColor: '#fca311',
        backgroundColor: 'rgba(252, 163, 17, 0.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#fca311',
        pointBorderColor: '#14213d',
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#14213d',
        titleColor: '#fff',
        bodyColor: '#9aa3b8',
        borderColor: '#fca311',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context: any) => `${context.parsed.y}ms`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(229, 229, 229, 0.06)',
        },
        ticks: {
          color: '#9aa3b8',
          maxRotation: 0,
          autoSkipPadding: 20,
        },
      },
      y: {
        grid: {
          color: 'rgba(229, 229, 229, 0.06)',
        },
        ticks: {
          color: '#9aa3b8',
          callback: (value: any) => `${value}ms`,
        },
      },
    },
  };

  return (
    <div className="h-48">
      <Line data={chartData} options={options} />
    </div>
  );
}
