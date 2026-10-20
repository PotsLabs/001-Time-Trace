import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, AreaClosed, Line, Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { curveMonotoneX } from '@visx/curve';
import { localPoint } from '@visx/event';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { Annotation, EditableAnnotation, Connector, CircleSubject, Label } from '@visx/annotation';
import { bisector, max } from 'd3-array';
import {
  type Callout, type Granularity, type Metric, type SeriesPoint,
  formatHours, formatPeriod, parseDay, startOfPeriod, toKey, toneColor,
} from './analytics';

interface TrendChartProps {
  width: number;
  height: number;
  series: SeriesPoint[];
  granularity: Granularity;
  metric: Metric;
  callouts: Callout[];
  selectedCalloutId: number | null;
  estimate: number | null; // only drawn in cumulative mode
  average: number | null; // mean of the plotted periods, drawn as a dotted reference line
  onAddCallout: (point: SeriesPoint, dx: number) => void; // dx points the label into the plot
  onMoveCallout: (callout: Callout, dx: number, dy: number) => void;
  onSelectCallout: (id: number) => void;
}

const margin = { top: 56, right: 24, bottom: 36, left: 44 };
const bisectDate = bisector<SeriesPoint, Date>(d => d.date).center;

// Shared label styling so every callout reads like the rest of the app
const labelProps = {
  backgroundFill: 'var(--color-background)',
  backgroundPadding: { top: 4, right: 6, bottom: 4, left: 6 },
  titleFontSize: 15,
  titleFontWeight: 700,
  subtitleFontSize: 13,
  subtitleFontWeight: 300,
  titleProps: { fontFamily: 'var(--font-primary)' },
  subtitleProps: { fontFamily: 'var(--font-secondary)', fill: 'var(--color-text-secondary)' },
  maxWidth: 180,
  showAnchorLine: false,
};

// Label auto-measure reports 0 on first paint, so size from text length instead
const labelWidth = (title: string, subtitle = '') =>
  Math.min(220, Math.max(title.length * 8.5, subtitle.length * 6.5) + 16);

const TrendChart: React.FC<TrendChartProps> = ({
  width, height, series, granularity, metric, callouts, selectedCalloutId, estimate, average,
  onAddCallout, onMoveCallout, onSelectCallout,
}) => {
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);
  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<SeriesPoint>();

  const xScale = useMemo(() => scaleTime({
    domain: series.length ? [series[0].date, series[series.length - 1].date] : [new Date(), new Date()],
    range: [0, innerWidth],
  }), [series, innerWidth]);

  const showEstimate = metric === 'cumulative' && estimate != null && estimate > 0;
  const yMax = Math.max(max(series, d => d.hours) ?? 0, showEstimate ? estimate! : 0, 1);
  const yScale = useMemo(() => scaleLinear({
    domain: [0, yMax * 1.1],
    range: [innerHeight, 0],
    nice: true,
  }), [yMax, innerHeight]);

  const pointsByKey = useMemo(() => new Map(series.map(p => [p.key, p])), [series]);

  const peak = useMemo(
    () => (metric === 'period' && series.length ? series.reduce((a, b) => (b.hours > a.hours ? b : a)) : null),
    [series, metric],
  );
  const estimateCrossing = showEstimate ? series.find(p => p.hours >= estimate!) ?? null : null;

  const nearestPoint = (event: React.MouseEvent<SVGRectElement>) => {
    const { x } = localPoint(event) ?? { x: 0 };
    const index = bisectDate(series, xScale.invert(x - margin.left));
    return series[index];
  };

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = nearestPoint(event);
    if (!point) return;
    showTooltip({ tooltipData: point, tooltipLeft: xScale(point.date) + margin.left, tooltipTop: yScale(point.hours) + margin.top });
  };

  if (width < 10 || series.length === 0) return null;

  const x = (p: SeriesPoint) => xScale(p.date);
  const y = (p: SeriesPoint) => yScale(p.hours);
  const unit = metric === 'cumulative' ? 'h total' : 'h';

  return (
    <div className="trend-chart">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={innerWidth} numTicks={4} stroke="#D0D0D0" strokeWidth={0.7} />

          <AreaClosed data={series} x={x} y={y} yScale={yScale} curve={curveMonotoneX}
            fill="var(--color-text-primary)" fillOpacity={0.04} />
          <LinePath data={series} x={x} y={y} curve={curveMonotoneX}
            stroke="var(--color-text-primary)" strokeWidth={1.5} />

          {average != null && average > 0 && (
            <g pointerEvents="none">
              <Line from={{ x: 0, y: yScale(average) }} to={{ x: innerWidth, y: yScale(average) }}
                stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" />
              <text x={innerWidth} y={yScale(average) - 6} textAnchor="end" className="average-label">
                Avg {formatHours(average)}h / {granularity}
              </text>
            </g>
          )}

          {showEstimate && (
            <Line from={{ x: 0, y: yScale(estimate!) }} to={{ x: innerWidth, y: yScale(estimate!) }}
              stroke="var(--color-accent)" strokeWidth={1} strokeDasharray="4 4" />
          )}
          {showEstimate && (
            <text x={innerWidth} y={yScale(estimate!) - 6} textAnchor="end" fill="var(--color-accent)"
              fontSize={13} fontWeight={300}>Estimate {estimate}h</text>
          )}

          <AxisLeft scale={yScale} numTicks={4} hideAxisLine hideTicks
            tickFormat={v => `${v}h`}
            tickLabelProps={{ fill: 'var(--color-text-secondary)', fontSize: 13, fontFamily: 'var(--font-secondary)', fontWeight: 300 }} />
          <AxisBottom top={innerHeight} scale={xScale} numTicks={Math.min(8, Math.floor(innerWidth / 90))}
            stroke="var(--color-text-primary)" strokeWidth={1} hideTicks
            tickFormat={v => (v as Date).toLocaleDateString('en-GB', granularity === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })}
            tickLabelProps={{ fill: 'var(--color-text-secondary)', fontSize: 13, fontFamily: 'var(--font-secondary)', fontWeight: 300 }} />

          {/* Hover + click capture, drawn under the callouts so labels stay interactive */}
          <Bar x={0} y={0} width={innerWidth} height={innerHeight} fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseMove={handleMove} onMouseLeave={hideTooltip}
            onClick={e => { const p = nearestPoint(e); if (p) onAddCallout(p, x(p) > innerWidth * 0.75 ? -180 : 30); }} />

          {tooltipData && (
            <g pointerEvents="none">
              <Line from={{ x: x(tooltipData), y: 0 }} to={{ x: x(tooltipData), y: innerHeight }}
                stroke="var(--color-text-secondary)" strokeWidth={0.7} />
              <circle cx={x(tooltipData)} cy={y(tooltipData)} r={4} fill="var(--color-accent)"
                stroke="var(--color-background)" strokeWidth={2} />
            </g>
          )}

          {/* Auto callout: busiest period */}
          {peak && peak.hours > 0 && (
            <Annotation x={x(peak)} y={y(peak)} dx={x(peak) > innerWidth - 200 ? -40 : 40} dy={-30}>
              <Connector stroke="var(--color-text-secondary)" type="elbow" />
              <CircleSubject stroke="var(--color-text-secondary)" radius={5} />
              <Label {...labelProps} title="Peak" subtitle={`${formatHours(peak.hours)}h · ${formatPeriod(peak.date, granularity)}`}
                width={labelWidth('Peak', `${formatHours(peak.hours)}h · ${formatPeriod(peak.date, granularity)}`)}
                fontColor="var(--color-text-secondary)" />
            </Annotation>
          )}

          {/* Auto callout: estimate reached (cumulative + single project) */}
          {estimateCrossing && (
            <Annotation x={x(estimateCrossing)} y={y(estimateCrossing)} dx={-60} dy={40}>
              <Connector stroke="var(--color-accent)" />
              <CircleSubject stroke="var(--color-accent)" radius={5} />
              <Label {...labelProps} title="Estimate reached" subtitle={formatPeriod(estimateCrossing.date, granularity)}
                width={labelWidth('Estimate reached', formatPeriod(estimateCrossing.date, granularity))}
                fontColor="var(--color-accent)" />
            </Annotation>
          )}

          {/* User callouts: drag the label to reposition, click it to edit */}
          {callouts.map(c => {
            const point = pointsByKey.get(toKey(startOfPeriod(parseDay(c.date), granularity)));
            if (!point) return null;
            const color = toneColor[c.tone] ?? toneColor.primary;
            const subtitle = c.note || `${formatHours(point.hours)}${unit}`;
            const selected = c.id === selectedCalloutId;
            return (
              <EditableAnnotation key={c.id} width={innerWidth} height={innerHeight}
                x={x(point)} y={y(point)} dx={c.dx} dy={c.dy}
                canEditSubject={false}
                labelDragHandleProps={{ r: 6, fill: 'transparent', stroke: selected ? color : 'transparent', strokeDasharray: '2 2' }}
                onDragEnd={({ dx, dy }) => onMoveCallout(c, dx, dy)}>
                <Connector stroke={color} />
                <CircleSubject stroke={color} radius={5} fill={selected ? color : 'none'} />
                <g style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onSelectCallout(c.id); }}>
                  <Label {...labelProps} title={c.label} subtitle={subtitle} width={labelWidth(c.label, subtitle)}
                    fontColor={color}
                    backgroundProps={{ stroke: selected ? color : 'none', strokeWidth: 0.7 }} />
                </g>
              </EditableAnnotation>
            );
          })}
        </Group>
      </svg>

      {tooltipData && (
        <TooltipWithBounds top={tooltipTop} left={tooltipLeft} unstyled applyPositionStyle className="chart-tooltip">
          <div className="chart-tooltip-value">{formatHours(tooltipData.hours)}{unit}</div>
          <div className="chart-tooltip-label">{formatPeriod(tooltipData.date, granularity)}</div>
          <div className="chart-tooltip-hint">Click to add callout</div>
        </TooltipWithBounds>
      )}
    </div>
  );
};

export default TrendChart;
