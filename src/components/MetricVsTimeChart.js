import { useState, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import html2canvas from 'html2canvas';

export default function MetricVsTimeChart({ data, metricField }) {
  const [enlarged, setEnlarged] = useState(false);
  const chartRef = useRef(null);

  if (!data?.length) return null;

  const chartData = data.map((d) => ({
    ...d,
    dateLabel: d.date ? new Date(d.date).toLocaleDateString([], { month: 'short', year: '2-digit' }) : '',
  }));

  const handleDownload = async (e) => {
    e?.stopPropagation();
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `plot_${metricField}_vs_time.png`;
      a.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const chart = (
    <div ref={chartRef} className="metric-vs-time-chart">
      <p className="metric-chart-label">{metricField} vs Time</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 15, 35, 0.92)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e2e8f0',
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ fill: '#818cf8', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      {enlarged && (
        <button className="metric-chart-download" onClick={handleDownload}>
          Download
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`metric-vs-time-wrap ${enlarged ? 'enlarged' : ''}`}
      onClick={() => setEnlarged(!enlarged)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setEnlarged(!enlarged)}
    >
      {chart}
    </div>
  );
}
