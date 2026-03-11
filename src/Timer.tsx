import React, { useState, useEffect } from 'react';

interface TimerProps {
  taskId: number;
  initialSeconds: number; // Starting time in seconds
  onTimeUpdate: (taskId: number, totalSeconds: number) => void;
  onStop: () => void;
}

const Timer: React.FC<TimerProps> = ({ taskId, initialSeconds, onTimeUpdate }) => {
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [isRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTotalSeconds((prev) => {
        const newTotal = prev + 1;
        onTimeUpdate(taskId, newTotal);
        return newTotal;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]); // Remove onTimeUpdate and taskId from dependencies

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