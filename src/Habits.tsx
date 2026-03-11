import React, { useState, useEffect } from 'react';
import './styles/PotsStyles.css';
import supabase from '../utils/Supabase.tsx';

interface Habit {
  id: string;
  name: string;
  type: 'daily' | 'weekly';
  sort_order: number;
  completed: boolean;
}

interface HabitsProps {
  viewMode: 'days' | 'weeks';
  selectedDate: Date;
}

const Habits: React.FC<HabitsProps> = ({ viewMode, selectedDate }) => {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Format date for database (YYYY-MM-DD)
  const formatDateForDb = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  // Get week start date (Monday) for weekly habits
  const getWeekStartDate = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  // Fetch habits and their completion status for the selected date
  useEffect(() => {
    fetchHabits();
  }, [viewMode, selectedDate]);

  const fetchHabits = async () => {
    setIsLoading(true);
    try {
      const habitType = viewMode === 'days' ? 'daily' : 'weekly';
      const dateForDb = formatDateForDb(
        viewMode === 'weeks' ? getWeekStartDate(selectedDate) : selectedDate
      );

      // Fetch habits with their completion status for the selected date
      const { data: habitsData, error: habitsError } = await supabase
        .from('habits')
        .select(`
          *,
          habit_completions!left(date, completed)
        `)
        .eq('type', habitType)
        .eq('is_active', true)
        .eq('habit_completions.date', dateForDb)
        .order('sort_order');

      if (habitsError) {
        console.error('Error fetching habits:', habitsError);
        return;
      }

      // Transform data to include completion status
      const habitsWithCompletion: Habit[] = (habitsData || []).map((habit: any) => ({
        id: habit.id,
        name: habit.name,
        type: habit.type,
        sort_order: habit.sort_order,
        completed: habit.habit_completions?.[0]?.completed || false,
      }));

      setHabits(habitsWithCompletion);
    } catch (error) {
      console.error('Error in fetchHabits:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle habit completion status
  const toggleHabit = async (habitId: string, currentCompleted: boolean) => {
    setIsSaving(true);
    try {
      const dateForDb = formatDateForDb(
        viewMode === 'weeks' ? getWeekStartDate(selectedDate) : selectedDate
      );

      // Upsert the completion status
      const { error } = await supabase
        .from('habit_completions')
        .upsert(
          {
            habit_id: habitId,
            date: dateForDb,
            completed: !currentCompleted,
          },
          {
            onConflict: 'habit_id,date',
          }
        );

      if (error) {
        console.error('Error saving habit completion:', error);
        return;
      }

      // Update local state
      setHabits(prev =>
        prev.map(habit =>
          habit.id === habitId
            ? { ...habit, completed: !currentCompleted }
            : habit
        )
      );
    } catch (error) {
      console.error('Error in toggleHabit:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatWeekRange = (date: Date) => {
    const startOfWeek = new Date(date);
    const endOfWeek = new Date(date);
    endOfWeek.setDate(date.getDate() + 6);
    return `${startOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  if (isLoading) {
    return (
      <div className="habits-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading habits...</p>
        </div>
      </div>
    );
  }

  const title = viewMode === 'days' ? 'Daily Habits' : 'Weekly Habits';
  const dateDisplay = viewMode === 'days' 
    ? formatDate(selectedDate) 
    : formatWeekRange(getWeekStartDate(selectedDate));

  return (
    <div className="habits-container">
      <div className="habits-header">
        <h2 className="habits-title">{title}</h2>
        <div className="habits-date">{dateDisplay}</div>
        {isSaving && <span className="saving-indicator">Saving...</span>}
      </div>
      <div className="habits-list">
        {habits.length === 0 ? (
          <p className="no-habits">No {viewMode === 'days' ? 'daily' : 'weekly'} habits found.</p>
        ) : (
          habits.map((habit, index) => (
            <div key={habit.id} className="habit-item">
              <div className="habit-timeline">
                <div className={`habit-dot ${habit.completed ? 'completed' : ''}`} />
                {index < habits.length - 1 && <div className="habit-line" />}
              </div>
              <button
                className={`habit-name ${habit.completed ? 'completed' : ''}`}
                onClick={() => toggleHabit(habit.id, habit.completed)}
                disabled={isSaving}
              >
                {habit.name}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Habits;
