import React, { useState, useEffect, useRef } from 'react';

interface TimerProps {
  taskId: number;
  initialSeconds: number; // Starting time in seconds
  onTimeUpdate: (taskId: number, totalSeconds: number) => void;
  onStop: () => void;
}

const Timer: React.FC<TimerProps> = ({ taskId, initialSeconds, onTimeUpdate }) => {
  // Anchor the wall-clock start so elapsed time is always Date.now()-based,
  // unaffected by tab throttling or skipped ticks.
  const startTimestamp = useRef(Date.now() - initialSeconds * 1000);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimestamp.current) / 1000);
      setTotalSeconds(elapsed);
      onTimeUpdate(taskId, elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    // <div className="timer-pill">
    //   <button className="timer-play-button" onClick={() => { setIsRunning(false); onStop(); }}>
    //     ⏹
    //   </button>
      <span className="timer-text">{formatTime(totalSeconds)}</span>
    // </div>
  );
};

export default Timer;