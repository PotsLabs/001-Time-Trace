export interface Database {
    public: {
        Tables: {
            projects: {
                Row: {
                    id: string;
                    client_id: string | null;
                    name: string;
                    description: string | null;
                    estimate_hours: number | null;
                    status: string; 
                    created_at: string;
                    updated_at: string;
                };

                Insert: {
                    id?: string;
                    client_id?: string | null;
                    name: string;
                    description: string | null;
                    estimate_hours?: number | null;
                    status?: string; 
                    created_at?: string;
                    updated_at:? string;
                };

                Update: {
                    id?: string;
                    client_id?: string;
                    name?: string;
                    description?: string | null;
                    estimate_hours?: number | null;
                    status?: string; 
                    created_at?: string;
                    updated_at?: string;
                };
            };
            time_entries: {
                Row: {
                    id: string;
                    project_id: string | null;
                    start_time: string | null;
                    end_time: string | null;
                    description: string | null;
                    date: string;
                    duration: number | null;
                    created_at: string;
                    updated_at: string;
                };

                Insert: {
                    id?: string;
                    project_id?: string | null;
                    start_time?: string | null;
                    end_time?: string | null;
                    description: string | null;
                    date: string;
                    duration?: number | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    project_id?: string | null;
                    start_time?: string | null;
                    end_time?: string | null;
                    description?: string | null;
                    date?: string;
                    duration?: number | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            habits: {
                Row: {
                    id: string;
                    name: string;
                    type: 'daily' | 'weekly';
                    sort_order: number;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    type: 'daily' | 'weekly';
                    sort_order?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    type?: 'daily' | 'weekly';
                    sort_order?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            habit_completions: {
                Row: {
                    id: string;
                    habit_id: string;
                    date: string;
                    completed: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    habit_id: string;
                    date: string;
                    completed?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    habit_id?: string;
                    date?: string;
                    completed?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };
        };
    };
}

// Frontend Habit Types
export interface Habit {
    id: string;
    name: string;
    type: 'daily' | 'weekly';
    sort_order: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface HabitCompletion {
    id: string;
    habit_id: string;
    date: string;
    completed: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface HabitWithCompletion extends Habit {
    completion?: HabitCompletion;
}
