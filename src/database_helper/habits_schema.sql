-- Habits Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor to create the required tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: habits
-- Stores habit definitions (daily and weekly habits)
-- ============================================
CREATE TABLE IF NOT EXISTS habits (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE habits IS 'Stores habit definitions for daily and weekly tracking';
COMMENT ON COLUMN habits.type IS 'Either daily or weekly habit';
COMMENT ON COLUMN habits.sort_order IS 'Display order for the habit list';

-- ============================================
-- TABLE: habit_completions
-- Stores completion status for habits on specific dates
-- ============================================
CREATE TABLE IF NOT EXISTS habit_completions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one completion record per habit per date
    UNIQUE(habit_id, date)
);

-- Add comment for documentation
COMMENT ON TABLE habit_completions IS 'Stores daily/weekly completion status for each habit';
COMMENT ON COLUMN habit_completions.date IS 'The date (for daily) or week start date (for weekly) of the completion record';

-- ============================================
-- INDEXES for performance
-- ============================================

-- Index for fetching habits by type
CREATE INDEX IF NOT EXISTS idx_habits_type ON habits(type);

-- Index for fetching active habits
CREATE INDEX IF NOT EXISTS idx_habits_active ON habits(is_active);

-- Index for fetching completions by date range
CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions(date);

-- Index for fetching completions by habit
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions(habit_id);

-- Composite index for efficient habit+date lookups
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_date ON habit_completions(habit_id, date);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS and create policies for data protection
-- ============================================

-- Enable RLS on habits table
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

-- Allow all users to read active habits
CREATE POLICY "Allow public read access to active habits"
    ON habits
    FOR SELECT
    USING (is_active = true);

-- Allow authenticated users to manage habits
CREATE POLICY "Allow authenticated users to manage habits"
    ON habits
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Enable RLS on habit_completions table
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their completions
CREATE POLICY "Allow authenticated users to manage completions"
    ON habit_completions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for habits table
CREATE TRIGGER update_habits_updated_at
    BEFORE UPDATE ON habits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for habit_completions table
CREATE TRIGGER update_habit_completions_updated_at
    BEFORE UPDATE ON habit_completions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Default Habits
-- ============================================

-- Insert default daily habits
INSERT INTO habits (name, type, sort_order) VALUES
    ('Morning Shower', 'daily', 1),
    ('Skin & Nail Care', 'daily', 2),
    ('Blueprint Meal Prep', 'daily', 3),
    ('Hair Care', 'daily', 4),
    ('Evening Shower', 'daily', 5)
ON CONFLICT DO NOTHING;

-- Insert default weekly habits
INSERT INTO habits (name, type, sort_order) VALUES
    ('Grocery Shopping', 'weekly', 1),
    ('Laundry', 'weekly', 2),
    ('House Cleaning', 'weekly', 3),
    ('Meal Planning', 'weekly', 4),
    ('Exercise x3', 'weekly', 5)
ON CONFLICT DO NOTHING;
