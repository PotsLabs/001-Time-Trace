import './styles/PotsStyles.css'
import TaskTable from './TaskTable';

function App() {

  return (
    <>
      <div className="app-header">
        <h1>Project Time</h1>
        <div className="tab-container">
          <button
            className="tab-button active"
          >
            Projects
          </button>
        </div>
      </div>
      
      <TaskTable />
    </>
  )
}
 
export default App;
