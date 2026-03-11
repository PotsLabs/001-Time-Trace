# Habits Feature - Supabase Setup Guide

This guide explains how to set up the database tables required for the Habits tracking feature in your Supabase backend.

## Overview

The Habits feature requires two main tables:
1. **`habits`** - Stores habit definitions (daily and weekly habits)
2. **`habit_completions`** - Stores completion status for each habit on specific dates

## Setup Steps

### Step 1: Open Supabase SQL Editor

1. Log in to your Supabase dashboard: https://app.supabase.io
2. Select your project
3. Go to the **SQL Editor** section (in the left sidebar)
4. Click **New Query**

### Step 2: Run the Schema SQL

Copy the entire contents of `habits_schema.sql` and paste it into the SQL Editor, then click **Run**.

The SQL will:
- Create the `habits` table with all required columns
- Create the `habit_completions` table with foreign key references
- Set up indexes for optimal query performance
- Configure Row Level Security (RLS) policies
- Create triggers for auto-updating timestamps
- Insert default daily and weekly habits

### Step 3: Verify Table Creation

After running the SQL, verify the tables were created:

1. Go to **Table Editor** in the left sidebar
2. You should see two new tables:
   - `habits`
   - `habit_completions`
3. Check that default habits are populated in the `habits` table

### Step 4: Enable Real-time (Optional)

If you want real-time updates when habits are modified:

1. Go to **Database** → **Replication** in the left sidebar
2. Toggle on **Realtime** for both tables:
   - `habits`
   - `habit_completions`

## Table Schema Details

### habits Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `name` | TEXT | Name of the habit (e.g., "Morning Shower") |
| `type` | TEXT | Either 'daily' or 'weekly' |
| `sort_order` | INTEGER | Display order in the list (default: 0) |
| `is_active` | BOOLEAN | Whether the habit is active (default: true) |
| `created_at` | TIMESTAMP | Auto-generated creation time |
| `updated_at` | TIMESTAMP | Auto-updated modification time |

### habit_completions Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `habit_id` | UUID | Foreign key referencing habits.id |
| `date` | DATE | The date of completion (or week start for weekly habits) |
| `completed` | BOOLEAN | Whether the habit was completed (default: false) |
| `created_at` | TIMESTAMP | Auto-generated creation time |
| `updated_at` | TIMESTAMP | Auto-updated modification time |

**Note**: There's a unique constraint on `(habit_id, date)` to prevent duplicate completion records.

## Row Level Security (RLS)

The schema includes RLS policies:

- **habits table**: 
  - Public can read active habits
  - Authenticated users can manage (CRUD) habits
  
- **habit_completions table**:
  - Authenticated users can manage their completions

## Default Habits

The schema automatically inserts these default habits:

### Daily Habits:
1. Morning Shower
2. Skin & Nail Care
3. Blueprint Meal Prep
4. Hair Care
5. Evening Shower

### Weekly Habits:
1. Grocery Shopping
2. Laundry
3. House Cleaning
4. Meal Planning
5. Exercise x3

## API Usage Examples

### Fetch Daily Habits with Completions

```typescript
const { data, error } = await supabase
  .from('habits')
  .select(`
    *,
    habit_completions(*)
  `)
  .eq('type', 'daily')
  .eq('is_active', true)
  .eq('habit_completions.date', '2026-02-06')
  .order('sort_order');
```

### Toggle Habit Completion

```typescript
// Upsert completion status
const { data, error } = await supabase
  .from('habit_completions')
  .upsert({
    habit_id: 'habit-uuid-here',
    date: '2026-02-06',
    completed: true
  }, {
    onConflict: 'habit_id,date'
  });
```

### Add New Habit

```typescript
const { data, error } = await supabase
  .from('habits')
  .insert({
    name: 'New Habit Name',
    type: 'daily',
    sort_order: 6
  });
```

## Troubleshooting

### Issue: Tables not appearing
- Ensure the SQL executed without errors
- Check the **Logs** section in Supabase for any error messages
- Verify you have the correct permissions

### Issue: Permission denied errors
- Check that RLS policies are properly configured
- Ensure you're using an authenticated client when making changes
- Verify the JWT token is valid

### Issue: Default habits not inserted
- The seed data uses `ON CONFLICT DO NOTHING`, so it won't error if habits already exist
- Manually check the habits table to see if data exists
- Run the INSERT statements separately if needed

## Next Steps

After setting up the database:

1. Update the Habits component to fetch from Supabase instead of using local state
2. Implement auto-save functionality similar to the Projects feature
3. Add habit management UI (create, edit, delete habits)
4. Consider adding habit streaks and statistics

## Files Reference

- `habits_schema.sql` - Database schema and setup script
- `types.d.ts` - TypeScript type definitions
- `Habits.tsx` - Frontend component (needs Supabase integration)
