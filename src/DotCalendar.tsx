import React, { useState } from 'react';

type ViewMode = 'days' | 'weeks';

interface DotCalendarProps {
  onViewChange: (mode: ViewMode, selectedDate: Date) => void;
}

const DotCalendar: React.FC<DotCalendarProps> = ({ onViewChange }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const [selectedIndex, setSelectedIndex] = useState<number>(getCurrentDayOfYear() - 1);

  function getCurrentDayOfYear(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  function getCurrentWeekOfYear(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  function getDateFromDayOfYear(dayOfYear: number): Date {
    const now = new Date();
    const date = new Date(now.getFullYear(), 0);
    date.setDate(dayOfYear);
    return date;
  }

  function getStartOfWeek(weekNumber: number): Date {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const daysOffset = (weekNumber - 1) * 7;
    const date = new Date(jan1);
    date.setDate(jan1.getDate() + daysOffset - jan1.getDay() + 1); // Monday
    return date;
  }

  const handleDotClick = (index: number) => {
    setSelectedIndex(index);
    
    if (viewMode === 'days') {
      const selectedDate = getDateFromDayOfYear(index + 1);
      onViewChange('days', selectedDate);
    } else {
      const selectedDate = getStartOfWeek(index + 1);
      onViewChange('weeks', selectedDate);
    }
  };

  const toggleViewMode = () => {
    const newMode = viewMode === 'days' ? 'weeks' : 'days';
    setViewMode(newMode);
    
    if (newMode === 'days') {
      const currentDay = getCurrentDayOfYear() - 1;
      setSelectedIndex(currentDay);
      onViewChange('days', getDateFromDayOfYear(currentDay + 1));
    } else {
      const currentWeek = getCurrentWeekOfYear() - 1;
      setSelectedIndex(currentWeek);
      onViewChange('weeks', getStartOfWeek(currentWeek + 1));
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const totalDots = viewMode === 'days' ? 365 : 52;
  const currentIndex = viewMode === 'days' ? getCurrentDayOfYear() - 1 : getCurrentWeekOfYear() - 1;

  const title = viewMode === 'days' ? 'This Year: 365 Days' : 'This Year: 52 Weeks';
  const subtitle = viewMode === 'days' 
    ? `Day ${selectedIndex + 1} / 365` 
    : `Week ${selectedIndex + 1} / 52`;
  
  const percentage = ((selectedIndex + 1) / totalDots * 100).toFixed(2);
  const selectedDate = viewMode === 'days' 
    ? getDateFromDayOfYear(selectedIndex + 1)
    : getStartOfWeek(selectedIndex + 1);

  return (
    <div className="dot-calendar">
      <div className="calendar-header">
        <h1 className="calendar-title">{title}</h1>
        <button className="toggle-view-button" onClick={toggleViewMode}>
          {viewMode === 'days' ? '→ Weeks' : '→ Days'}
        </button>
      </div>
      
      <div className="calendar-info">
        <div className="info-left">
          <div className="info-subtitle">{subtitle}</div>
          <div className="info-percentage">{percentage}%</div>
        </div>
        <div className="info-date">{formatDate(selectedDate)}</div>
      </div>

      <div className="dots-container">
        {Array.from({ length: totalDots }).map((_, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isSelected = index === selectedIndex;

          return (
            <div
              key={index}
              className={`dot ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => handleDotClick(index)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default DotCalendar;