import React from 'react';
import type { SeriesStyle } from './analytics';

/** A short sample of a series line (solid or dotted), used wherever a project's line is named. */
const LineSwatch: React.FC<{ style: SeriesStyle }> = ({ style }) => (
  <svg className="line-swatch" width={20} height={8} aria-hidden="true">
    <line x1={2} x2={18} y1={4} y2={4} stroke={style.color} strokeLinecap="round"
      strokeWidth={style.dashed ? 2.5 : 2} strokeDasharray={style.dashed ? '0.1 5' : undefined} />
  </svg>
);

export default LineSwatch;
