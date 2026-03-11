import './styles/PotsStyles.css'
import { useState } from 'react';
import TaskTable from './TaskTable';
import Habits from './Habits';
import DotCalendar from './DotCalendar';

type Tab = 'projects' | 'habits';
type ViewMode = 'days' | 'weeks';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const handleViewChange = (mode: ViewMode, date: Date) => {
    setViewMode(mode);
    setSelectedDate(date);
  };

  return (
    <>
      <div className="app-header">
        <h1>Project Time</h1>
        <div className="tab-container">
          <button
            className={`tab-button ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            Projects
          </button>
          <button
            className={`tab-button ${activeTab === 'habits' ? 'active' : ''}`}
            onClick={() => setActiveTab('habits')}
          >
            Habits
          </button>
        </div>
      </div>
      
      {activeTab === 'projects' ? (
        <TaskTable />
      ) : (
        <div className="habits-view">
          <DotCalendar onViewChange={handleViewChange} />
          <Habits viewMode={viewMode} selectedDate={selectedDate} />
        </div>
      )}
    </>
  )
}
 
export default App;
