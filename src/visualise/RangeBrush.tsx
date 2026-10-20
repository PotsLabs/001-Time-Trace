import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AreaClosed } from '@visx/shape';
import { Brush, type Bounds } from '@visx/brush';
import { curveMonotoneX } from '@visx/curve';
import { max } from 'd3-array';
import { type DateRange, type SeriesPoint, parseDay, toKey } from './analytics';

interface RangeBrushProps {
  width: number;
  height: number;
  series: SeriesPoint[]; // daily, across the full data extent
  range: DateRange;
  onChange: (range: DateRange) => void;
}

const margin = { top: 4, right: 24, bottom: 4, left: 44 };

const RangeBrush: React.FC<RangeBrushProps> = ({ width, height, series, range, onChange }) => {
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(() => scaleTime({
    domain: series.length ? [series[0].date, series[series.length - 1].date] : [new Date(), new Date()],
    range: [0, innerWidth],
  }), [series, innerWidth]);

  const yScale = useMemo(() => scaleLinear({
    domain: [0, max(series, d => d.hours) || 1],
    range: [innerHeight, 0],
  }), [series, innerHeight]);

  if (width < 10 || series.length === 0) return null;

  const handleChange = (bounds: Bounds | null) => {
    if (!bounds) return;
    const from = toKey(new Date(bounds.x0));
    const to = toKey(new Date(bounds.x1));
    if (from !== range.from || to !== range.to) onChange({ from, to });
  };

  return (
    <svg width={width} height={height} className="range-brush">
      <Group left={margin.left} top={margin.top}>
        <AreaClosed data={series} x={d => xScale(d.date)} y={d => yScale(d.hours)} yScale={yScale}
          curve={curveMonotoneX} fill="var(--color-text-secondary)" fillOpacity={0.35} />
        <Brush
          xScale={xScale}
          yScale={yScale}
          width={innerWidth}
          height={innerHeight}
          handleSize={8}
          resizeTriggerAreas={['left', 'right']}
          brushDirection="horizontal"
          initialBrushPosition={{
            start: { x: xScale(parseDay(range.from)) },
            end: { x: xScale(parseDay(range.to)) },
          }}
          onChange={handleChange}
          selectedBoxStyle={{ fill: 'var(--color-accent)', fillOpacity: 0.12, stroke: 'var(--color-accent)', strokeWidth: 1 }}
          disableDraggingSelection={false}
          useWindowMoveEvents
        />
      </Group>
    </svg>
  );
};

export default RangeBrush;
