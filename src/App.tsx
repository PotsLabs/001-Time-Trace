import { useState } from 'react';
import './styles/PotsStyles.css'
import TaskTable from './TaskTable';
import Visualise from './visualise/Visualise';

type Tab = 'projects' | 'visualise';

function App() {
  const [tab, setTab] = useState<Tab>('projects');

  return (
    <>
      <div className="app-header">
        <h1>{tab === 'projects' ? 'Project Time' : 'Visualise'}</h1>
        <div className="tab-container">
          <button
            className={`tab-button ${tab === 'projects' ? 'active' : ''}`}
            onClick={() => setTab('projects')}
          >
            Projects
          </button>
          <button
            className={`tab-button ${tab === 'visualise' ? 'active' : ''}`}
            onClick={() => setTab('visualise')}
          >
            Visualise
          </button>
        </div>
      </div>

      {/* Keep TaskTable mounted so a running timer survives tab switches */}
      <div hidden={tab !== 'projects'}><TaskTable /></div>
      {tab === 'visualise' && <Visualise />}
    </>
  )
}

export default App;
