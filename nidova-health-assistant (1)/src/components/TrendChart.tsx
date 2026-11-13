import { useState } from 'react';
import type { TrendPoint } from '../types';

interface TrendChartProps {
  parameterLabel: string;
  points: TrendPoint[];
}

export function TrendChart({ parameterLabel, points }: TrendChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return null;
  }

  const width = 760;
  const height = 280;
  const padLeft = 56;
  const padRight = 28;
  const padTop = 28;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = points.map((p) => p.value);
  const refMins = points.map((p) => p.referenceMin).filter((v): v is number => v !== null);
  const refMaxs = points.map((p) => p.referenceMax).filter((v): v is number => v !== null);
  const refMin = refMins.length > 0 ? refMins[refMins.length - 1] : null;
  const refMax = refMaxs.length > 0 ? refMaxs[refMaxs.length - 1] : null;

  const rawMin = Math.min(...allValues, ...(refMin !== null ? [refMin] : []));
  const rawMax = Math.max(...allValues, ...(refMax !== null ? [refMax] : []));
  const span = rawMax - rawMin || 1;
  const yMin = rawMin - span * 0.18;
  const yMax = rawMax + span * 0.18;

  const getX = (idx: number) =>
    points.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (points.length - 1)) * plotW;

  const getY = (val: number) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  const polylinePoints = points.map((p, i) => `${getX(i)},${getY(p.value)}`).join(' ');

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  const statusColor = (status: TrendPoint['status']) => {
    switch (status) {
      case 'normal':
        return '#15803d';
      case 'critical':
        return '#b91c1c';
      case 'high':
      case 'low':
        return '#b45309';
      default:
        return '#475569';
    }
  };

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{parameterLabel}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {points[0].unit || 'Unitless'} · {points.length} recorded measurements
            {refMin !== null && refMax !== null
              ? ` · Shaded reference band: ${refMin}–${refMax} ${points[0].unit}`
              : ' · No uniform reference range'}
          </p>
        </div>
        {activePoint && (
          <div className="text-xs font-mono tabular-nums text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
            {activePoint.date}: {activePoint.value} {activePoint.unit} ({activePoint.status.toUpperCase()})
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[520px] h-auto select-none"
          role="img"
          aria-label={`Longitudinal trend chart for ${parameterLabel}`}
        >
          {/* Reference range band */}
          {refMin !== null && refMax !== null && (
            <rect
              x={padLeft}
              y={getY(refMax)}
              width={plotW}
              height={Math.max(0, getY(refMin) - getY(refMax))}
              fill="#0f766e"
              fillOpacity={0.08}
            />
          )}

          {/* Horizontal gridlines */}
          {tickValues.map((tv, i) => {
            const y = getY(tv);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={i === 0 ? undefined : '3 3'}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px] font-mono tabular-nums"
                >
                  {tv.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Trend line */}
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#0f766e"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />
          )}

          {/* Data points & X-axis dates */}
          {points.map((pt, i) => {
            const cx = getX(i);
            const cy = getY(pt.value);
            const color = statusColor(pt.status);
            const isHovered = hoveredIdx === i;
            return (
              <g
                key={`${pt.documentId}-${i}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 7 : 5}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={2.5}
                />
                <text
                  x={cx}
                  y={cy - 12}
                  textAnchor="middle"
                  className="fill-slate-900 text-[11px] font-mono font-medium tabular-nums"
                >
                  {pt.value}
                </text>
                <text
                  x={cx}
                  y={height - 14}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-mono tabular-nums"
                >
                  {pt.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
