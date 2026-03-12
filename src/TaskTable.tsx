import React, { useState, useEffect, useRef } from 'react';
import './styles/PotsStyles.css';
import Timer from './Timer';
import DotCalendar from './DotCalendar';
import Modal from './Modal';
import ProjectForm from './ProjectForm';

interface Task {
  id: number;
  name: string;
  description: string;
  estimate_hours: number;
  time_entries: {
    [date: string]: number; // date as key, hours as value
  };
}

interface ActiveTimer {
  taskId: number;
  startTime: Date;
}

const TaskTable: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Get dates to display - always show current week (Monday to Sunday)
  const getDisplayDates = () => {
    const currentDay = selectedDate.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Start from Monday
    
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(selectedDate);
      date.setDate(selectedDate.getDate() + diff + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day}-${month}`;
  };

  const formatHeaderDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    return { short: `${day}-${month}`, dayName };
  };

  const getTodayKey = () => {
    return formatDate(new Date());
  };

  const displayDates = getDisplayDates();

  const handleCalendarViewChange = (_mode: string, date: Date) => {
    setSelectedDate(date);
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Convert database date format (YYYY-MM-DD) to display format (D-Mon)
  const convertDbDateToDisplay = (dbDate: string): string => {
    const date = new Date(dbDate);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day}-${month}`;
  };

  // Convert display date format (D-Mon) to database format (YYYY-MM-DD)
  const convertDisplayDateToDb = (displayDate: string): string => {
    const [day, month] = displayDate.split('-');
    const year = new Date().getFullYear(); // Use current year
    const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
    
    // Create date in UTC to avoid timezone shifts
    const dateStr = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
    return dateStr;
  };

  // Fetch projects from local API
  const fetchProjects = async (): Promise<Task[]> => {
    const res = await fetch('/api/projects');
    const projects: any[] = await res.json();
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      estimate_hours: p.estimate_hours || 0,
      time_entries: {}
    }));
  };

  // Fetch time entries for all projects and merge into tasks
  const fetchTimeEntries = async (tasks: Task[]): Promise<Task[]> => {
    if (tasks.length === 0) return tasks;

    const ids = tasks.map(t => t.id).join(',');
    const res = await fetch(`/api/time-entries?project_ids=${ids}`);
    const entries: any[] = await res.json();

    const byProject: { [key: number]: any[] } = {};
    entries.forEach(e => {
      if (!byProject[e.project_id]) byProject[e.project_id] = [];
      byProject[e.project_id].push(e);
    });

    return tasks.map(task => {
      const taskEntries = byProject[task.id] || [];
      const time_entries: { [date: string]: number } = {};
      taskEntries.forEach(e => {
        time_entries[convertDbDateToDisplay(e.date)] = e.duration / 3600;
      });
      return { ...task, time_entries };
    });
  };

  // Load data from local SQLite on component mount
  const loadData = async () => {
    setIsLoading(true);
    isLoadingData.current = true;
    try {
      const projects = await fetchProjects();
      const tasksWithEntries = await fetchTimeEntries(projects);
      setTasks(tasksWithEntries);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setTimeout(() => { isLoadingData.current = false; }, 500);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: number; dateKey: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitialMount = useRef(true);
  const isLoadingData = useRef(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [_isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [_isAdjustDateModalOpen, setIsAdjustDateModalOpen] = useState(false);
  const [_taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [_taskToAdjustDate, setTaskToAdjustDate] = useState<number | null>(null);

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  // Autosave effect - saves 2 seconds after any change to tasks
  useEffect(() => {
    // Skip autosave on initial mount or during data loading
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Skip autosave if currently loading data from database
    if (isLoadingData.current) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeEntries(true);
    }, 2000);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tasks]); // Trigger whenever tasks change

  const handlePlayButton = (taskId: number) => {
    if (activeTimer?.taskId === taskId) {
      // Stop: record the completed session
      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - activeTimer.startTime.getTime()) / 1000);
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: taskId,
          date: convertDisplayDateToDb(getTodayKey()),
          start_time: activeTimer.startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration
        })
      });
      setActiveTimer(null);
    } else {
      // Start timer — capture wall-clock start
      setActiveTimer({ taskId, startTime: new Date() });
    }
  };

  const handleTimeUpdate = (taskId: number, totalSeconds: number) => {
    const todayKey = getTodayKey();
    const hours = totalSeconds / 3600;

    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId
          ? {
              ...task,
              time_entries: {
                ...task.time_entries,
                [todayKey]: hours
              }
            }
          : task
      )
    );
  };

  const handleTimerStop = () => {
    setActiveTimer(null);
  };

  const getInitialSeconds = (task: Task): number => {
    const todayKey = getTodayKey();
    const hours = task.time_entries[todayKey] || 0;
    return Math.floor(hours * 3600);
  };

  const saveTimeEntries = async (isAutoSave: boolean = false) => {
    setIsSaving(true);
    try {
      for (const task of tasks) {
        for (const [dateKey, hours] of Object.entries(task.time_entries)) {
          await fetch('/api/time-entries', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: task.id,
              date: convertDisplayDateToDb(dateKey),
              duration: Math.round(hours * 3600)
            })
          });
        }
      }
      setLastSaved(new Date());
      if (!isAutoSave) alert('Data saved successfully!');
    } catch (error) {
      console.error('Error saving time entries:', error);
      if (!isAutoSave) alert('Error saving data. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTask = () => {
    setIsModalOpen(true);
  };

  const handleCreateProject = async (formData: { name: string; description: string; estimate_hours: number }) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const project = await res.json();
      setTasks(prev => [...prev, {
        id: project.id,
        name: project.name,
        description: project.description || '',
        estimate_hours: project.estimate_hours || 0,
        time_entries: {}
      }]);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleCancelModal = () => {
    setIsModalOpen(false);
  };

  const handleEditTask = (taskId: number) => {
    setEditingTaskId(taskId);
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = async (formData: { name: string; description: string; estimate_hours: number }) => {
    if (!editingTaskId) return;
    try {
      await fetch(`/api/projects/${editingTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setTasks(prev => prev.map(task =>
        task.id === editingTaskId ? { ...task, ...formData } : task
      ));
      setIsEditModalOpen(false);
      setEditingTaskId(null);
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleCancelEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTaskId(null);
  };

  const handleCellClick = (task: Task, dateKey: string) => {
    const hours = task.time_entries[dateKey] || 0;
    setEditingCell({ taskId: task.id, dateKey });
    setEditingValue(hours > 0 ? formatTime(hours) : '');
  };

  // Accepts H:MM or a plain decimal number
  const parseTimeInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '-') return 0;
    if (trimmed.includes(':')) {
      const [h, m] = trimmed.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h + m / 60;
    }
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n;
  };

  const commitCellEdit = (taskId: number, dateKey: string) => {
    const hours = parseTimeInput(editingValue);
    if (hours === null) {
      setEditingCell(null);
      return;
    }
    setTasks(prev => prev.map(task =>
      task.id === taskId
        ? { ...task, time_entries: { ...task.time_entries, [dateKey]: hours } }
        : task
    ));
    fetch('/api/time-entries', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: taskId,
        date: convertDisplayDateToDb(dateKey),
        duration: Math.round(hours * 3600)
      })
    });
    setEditingCell(null);
  };

  const calculateProgress = (task: Task) => {
    const totalHours = Object.values(task.time_entries).reduce((sum, hours) => sum + hours, 0);
    return (totalHours / task.estimate_hours) * 100;
  };

  const formatTime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="task-table-container">
      <DotCalendar onViewChange={handleCalendarViewChange} />
      
      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading projects and time entries...</p>
        </div>
      ) : (
        <>
          <table className="task-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Progress</th>
                {displayDates.map((date, index) => {
                  const header = formatHeaderDate(date);
                  return (
                    <th key={index} className="date-header">
                     <div className="date-short">{header.dayName}</div>
                      <div className="date-day">{header.short}</div>
                     
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const isActive = activeTimer?.taskId === task.id;
                return (
                  <tr key={task.id}>
                <td className="project-cell">
                  <div className="project-name">
                    <span 
                      className="project-name-text"
                      onClick={() => handleEditTask(task.id)}
                      title="Click to edit project"
                    >
                      {task.name}
                    </span>
                    <button 
                      className={`play-button ${isActive ? 'active' : ''}`}
                      onClick={() => handlePlayButton(task.id)}
                    >
                      {isActive ? '■' : '▶'}
                    </button>
                    {isActive && (
                      <span className="timer-display">
                        <Timer
                          taskId={task.id}
                          initialSeconds={getInitialSeconds(task)}
                          onTimeUpdate={handleTimeUpdate}
                          onStop={handleTimerStop}
                        />
                      </span>
                    )}
                  </div>
                  <div className="project-description">{task.description}</div>
                </td>
                    <td className="progress-cell">
                      <div className="progress-info">
                        <span className="hours-spent">{Math.floor(Object.values(task.time_entries).reduce((sum, hours) => sum + hours, 0))} hrs</span>
                        <span className="hours-budget">/{task.estimate_hours} hrs</span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${Math.min(calculateProgress(task), 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    {displayDates.map((date, index) => {
                      const dateKey = formatDate(date);
                      const hours = task.time_entries[dateKey] || 0;
                      const isEditing = editingCell?.taskId === task.id && editingCell?.dateKey === dateKey;
                      return (
                        <td key={index} className="time-cell">
                          {isEditing ? (
                            <input
                              className="time-cell-input"
                              type="text"
                              value={editingValue}
                              autoFocus
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => commitCellEdit(task.id, dateKey)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitCellEdit(task.id, dateKey);
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                            />
                          ) : (
                            <span
                              className="time-cell-value"
                              onClick={() => handleCellClick(task, dateKey)}
                            >
                              {hours > 0 ? formatTime(hours) : '-'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="button-group">
            <button className="add-task-button" onClick={handleAddTask}>
              +
            </button>
            <button
              className="save-button"
              onClick={() => saveTimeEntries(false)}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            {lastSaved && (
              <span className="last-saved">
                Last saved: {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCancelModal}
        title="Create New Project"
      >
        <ProjectForm
          onSubmit={handleCreateProject}
          onCancel={handleCancelModal}
        />
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={handleCancelEditModal}
        title="Edit Project"
        showActions={true}
        onDelete={() => {
          setTaskToDelete(editingTaskId);
          setIsDeleteModalOpen(true);
          setIsEditModalOpen(false);
        }}
        onAdjustDate={() => {
          setTaskToAdjustDate(editingTaskId);
          setIsAdjustDateModalOpen(true);
          setIsEditModalOpen(false);
        }}
      >
        {editingTaskId && (
          <ProjectForm
            onSubmit={handleUpdateProject}
            onCancel={handleCancelEditModal}
            initialData={{
              name: tasks.find(t => t.id === editingTaskId)?.name || '',
              description: tasks.find(t => t.id === editingTaskId)?.description || '',
              estimate_hours: tasks.find(t => t.id === editingTaskId)?.estimate_hours || 100
            }}
            isEditing={true}
          />
        )}
      </Modal>
    </div>
  );
};

export default TaskTable;