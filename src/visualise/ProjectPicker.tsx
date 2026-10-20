import React, { useEffect, useRef, useState } from 'react';
import LineSwatch from './LineSwatch';
import { type Project, type SeriesStyle, formatHours } from './analytics';

interface ProjectPickerProps {
  label: string;
  projects: Project[];
  hours: Map<number, number>; // shown beside each option, sorted by it
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  styleFor?: (id: number) => SeriesStyle | undefined; // shows each picked project's line, doubling as the legend
  maxSelected?: number;
}

/** Multi-select dropdown slicer. */
const ProjectPicker: React.FC<ProjectPickerProps> = ({ label, projects, hours, selected, onChange, styleFor, maxSelected }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const sorted = [...projects].sort((a, b) => (hours.get(b.id) ?? 0) - (hours.get(a.id) ?? 0));
  const atMax = maxSelected != null && selected.size >= maxSelected;
  const summary = selected.size === projects.length ? 'All' : selected.size === 0 ? 'None' : String(selected.size);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else if (!atMax) next.add(id);
    onChange(next);
  };

  return (
    <div className="project-picker" ref={rootRef}>
      <button className={`toggle-view-button ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        {label}: {summary} <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-menu">
          <div className="picker-actions">
            {maxSelected == null
              ? <button onClick={() => onChange(new Set(projects.map(p => p.id)))}>All</button>
              : <button onClick={() => onChange(new Set(sorted.slice(0, 4).map(p => p.id)))}>Top 4</button>}
            <button onClick={() => onChange(new Set())}>None</button>
            {maxSelected != null && <span className="text-secondary">Up to {maxSelected}</span>}
          </div>
          {sorted.map(p => {
            const checked = selected.has(p.id);
            const style = checked ? styleFor?.(p.id) : undefined;
            return (
              <button key={p.id} className={`picker-option ${checked ? 'checked' : ''}`}
                disabled={!checked && atMax} onClick={() => toggle(p.id)}>
                {style ? <LineSwatch style={style} /> : <i className="picker-check" />}
                <span className="picker-name">{p.name}</span>
                <span className="picker-hours">{formatHours(hours.get(p.id) ?? 0)}h</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectPicker;
