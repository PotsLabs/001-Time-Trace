import React, { useState, useEffect, useRef } from 'react';
import './styles/PotsStyles.css';
import supabase from '../utils/Supabase.tsx';
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

  // Fetch projects from Supabase
  const fetchProjects = async (): Promise<{ tasks: Task[], idMap: { [key: number]: string } }> => {
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching projects:', error);
        return { tasks: [], idMap: {} };
      }

      if (!projects || projects.length === 0) {
        return { tasks: [], idMap: {} };
      }

      // Store UUID mappings for existing projects
      const newProjectIdMap: { [key: number]: string } = {};
      const localTasks: Task[] = [];

      projects.forEach((project, index) => {
        const localId = index + 1; // Use sequential local IDs
        newProjectIdMap[localId] = project.id;
        
        localTasks.push({
          id: localId,
          name: project.name,
          description: project.description || '',
          estimate_hours: project.estimate_hours || 0,
          time_entries: {}
        });
      });

      setProjectIdMap(newProjectIdMap);
      setNextId(projects.length + 1);
      
      return { tasks: localTasks, idMap: newProjectIdMap };
    } catch (error) {
      console.error('Error fetching projects:', error);
      return { tasks: [], idMap: {} };
    }
  };

  // Fetch time entries for all projects
  const fetchTimeEntries = async (tasks: Task[], idMap: { [key: number]: string }): Promise<Task[]> => {
    if (tasks.length === 0) return tasks;

    try {
      // Get all project UUIDs
      const projectUuids = tasks.map(task => idMap[task.id]).filter(Boolean);
      
      if (projectUuids.length === 0) return tasks;

      const { data: timeEntries, error } = await supabase
        .from('time_entries')
        .select('*')
        .in('project_id', projectUuids);

      if (error) {
        console.error('Error fetching time entries:', error);
        return tasks;
      }

      if (!timeEntries || timeEntries.length === 0) {
        return tasks;
      }

      // Group time entries by project UUID
      const timeEntriesByProject: { [key: string]: any[] } = {};
      timeEntries.forEach(entry => {
        if (!timeEntriesByProject[entry.project_id]) {
          timeEntriesByProject[entry.project_id] = [];
        }
        timeEntriesByProject[entry.project_id].push(entry);
      });

      // Update tasks with time entries
      return tasks.map(task => {
        const projectUuid = idMap[task.id];
        const entries = timeEntriesByProject[projectUuid] || [];
        
        const timeEntriesObj: { [date: string]: number } = {};
        entries.forEach(entry => {
          const displayDate = convertDbDateToDisplay(entry.date);
          timeEntriesObj[displayDate] = entry.duration / 3600; // Convert seconds to hours
        });

        return {
          ...task,
          time_entries: timeEntriesObj
        };
      });
    } catch (error) {
      console.error('Error fetching time entries:', error);
      return tasks;
    }
  };

  // Load data from Supabase on component mount
  const loadData = async () => {
    setIsLoading(true);
    isLoadingData.current = true; // Prevent autosave during load
    try {
      // Fetch projects first
      const { tasks: projects, idMap } = await fetchProjects();
      
      if (projects.length === 0) {
        // No existing data, set default projects
        const defaultTasks: Task[] = [
          { 
            id: 1, 
            name: 'POTS3 - R&D Project', 
            description: 'All work done for Pots Industries Development', 
            estimate_hours: 150,
            time_entries: {
              '6-Feb': 0.25,
              '7-Feb': 0.25
            }
          },
          { 
            id: 2, 
            name: 'Pots - Study Work', 
            description: 'Time Spent on Masters course Work', 
            estimate_hours: 150,
            time_entries: {
              '6-Feb': 0.5,
              '7-Feb': 0.5
            }
          }
        ];
        setTasks(defaultTasks);
        setNextId(3);
      } else {
        // Fetch time entries for the projects using the idMap
        const tasksWithTimeEntries = await fetchTimeEntries(projects, idMap);
        setTasks(tasksWithTimeEntries);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Fallback to default data
      const defaultTasks: Task[] = [
        { 
          id: 1, 
          name: 'POTS3 - R&D Project', 
          description: 'All work done for Pots Industries Development', 
          estimate_hours: 150,
          time_entries: {
            '6-Feb': 0.25,
            '7-Feb': 0.25
          }
        },
        { 
          id: 2, 
          name: 'Pots - Study Work', 
          description: 'Time Spent on Masters course Work', 
          estimate_hours: 150,
          time_entries: {
            '6-Feb': 0.5,
            '7-Feb': 0.5
          }
        }
      ];
      setTasks(defaultTasks);
      setNextId(3);
    } finally {
      setIsLoading(false);
      // Small delay to ensure state has settled before enabling autosave
      setTimeout(() => {
        isLoadingData.current = false;
      }, 500);
    }
  };

  const [nextId, setNextId] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [projectIdMap, setProjectIdMap] = useState<{ [key: number]: string }>({}); // Map local IDs to UUIDs
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
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
      saveToSupabase(true); // Pass true to indicate autosave
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
      // Stop the timer
      setActiveTimer(null);
    } else {
      // Start timer for this task
      setActiveTimer({ taskId });
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

  const saveToSupabase = async (isAutoSave: boolean = false) => {
    setIsSaving(true);
    try {
      // First, save all projects and get their UUIDs
      const projectUuids: { [key: number]: string } = {};
      
      for (const task of tasks) {
        const existingUuid = projectIdMap[task.id];
        
        if (existingUuid) {
          // Update existing project
          const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .update({
              name: task.name,
              description: task.description,
              estimate_hours: task.estimate_hours,
              status: 'active',
              client_id: null
            })
            .eq('id', existingUuid)
            .select()
            .single();

          if (projectError) {
            console.error('Error updating project:', projectError);
            continue;
          }
          
          projectUuids[task.id] = projectData.id;
        } else {
          // Create new project
          const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .insert({
              name: task.name,
              description: task.description,
              estimate_hours: task.estimate_hours,
              status: 'active',
              client_id: null
            })
            .select()
            .single();

          if (projectError) {
            console.error('Error creating project:', projectError);
            continue;
          }
          
          projectUuids[task.id] = projectData.id;
        }
      }

      // Update the projectIdMap with any new UUIDs
      setProjectIdMap(prev => ({ ...prev, ...projectUuids }));

      // Then save time entries for each project
      for (const task of tasks) {
        const projectUuid = projectUuids[task.id];
        if (!projectUuid) continue;

        // Get existing time entries for this project
        const { data: existingEntries } = await supabase
          .from('time_entries')
          .select('id, date')
          .eq('project_id', projectUuid);

        // Create a map of existing entries by date
        const existingEntriesMap = new Map(
          (existingEntries || []).map(entry => [entry.date, entry.id])
        );

        // Save all time entries for this project
        for (const [dateKey, hours] of Object.entries(task.time_entries)) {
          // Convert date format from "6-Feb" to "2026-02-06"
          const dateString = convertDisplayDateToDb(dateKey);
          const duration = Math.round(hours * 3600); // Convert hours to seconds

          const existingEntryId = existingEntriesMap.get(dateString);

          if (existingEntryId) {
            // Update existing entry by ID
            const { error: updateError } = await supabase
              .from('time_entries')
              .update({ duration: duration })
              .eq('id', existingEntryId);

            if (updateError) {
              console.error('Error updating time entry:', updateError);
            }
          } else {
            // Insert new entry
            const { error: insertError } = await supabase
              .from('time_entries')
              .insert({
                project_id: projectUuid,
                date: dateString,
                duration: duration,
                description: null
              });

            if (insertError) {
              console.error('Error inserting time entry:', insertError);
            }
          }
        }
      }

      setLastSaved(new Date());
      if (!isAutoSave) {
        alert('Data saved successfully!');
      }
    } catch (error) {
      console.error('Error saving to Supabase:', error);
      if (!isAutoSave) {
        alert('Error saving data. Check console for details.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTask = () => {
    setIsModalOpen(true);
  };

  const handleCreateProject = (formData: { name: string; description: string; estimate_hours: number }) => {
    const newTask: Task = {
      id: nextId,
      name: formData.name,
      description: formData.description,
      estimate_hours: formData.estimate_hours,
      time_entries: {}
    };
    
    setTasks([...tasks, newTask]);
    setNextId(nextId + 1);
    setIsModalOpen(false);
    
    // Save to Supabase immediately when creating a new project
    saveToSupabase(false);
  };

  const handleCancelModal = () => {
    setIsModalOpen(false);
  };

  const handleEditTask = (taskId: number) => {
    setEditingTaskId(taskId);
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = (formData: { name: string; description: string; estimate_hours: number }) => {
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === editingTaskId
          ? {
              ...task,
              name: formData.name,
              description: formData.description,
              estimate_hours: formData.estimate_hours
            }
          : task
      )
    );
    setIsEditModalOpen(false);
    setEditingTaskId(null);
    
    // Save to Supabase immediately when updating a project
    saveToSupabase(false);
  };

  const handleCancelEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTaskId(null);
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
                      return (
                        <td key={index} className="time-cell">
                          {hours > 0 ? formatTime(hours) : '-'}
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
              onClick={() => saveToSupabase(false)}
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