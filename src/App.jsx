import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PomodoroProvider }     from './contexts/PomodoroContext';
import { IntelligenceProvider } from './contexts/IntelligenceContext';
import { AuthProvider }         from './contexts/AuthContext';
import Layout      from './components/layout/Layout';
import Dashboard   from './pages/Dashboard';
import Subjects    from './pages/Subjects';
import Schedule    from './pages/Schedule';
import Assignments from './pages/Assignments';
import Exams       from './pages/Exams';
import Grades      from './pages/Grades';
import Pomodoro    from './pages/Pomodoro';
import Reminders   from './pages/Reminders';
import Analytics   from './pages/Analytics';
import Revision    from './pages/Revision';
import Planner     from './pages/Planner';
import Profile     from './pages/Profile';
import Assistant   from './pages/Assistant';
import Workspace   from './pages/Workspace';
import Library     from './pages/Library';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <PomodoroProvider>
        <IntelligenceProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index              element={<Dashboard   />} />
              <Route path="subjects"    element={<Subjects    />} />
              <Route path="schedule"    element={<Schedule    />} />
              <Route path="assignments" element={<Assignments />} />
              <Route path="exams"       element={<Exams       />} />
              <Route path="grades"      element={<Grades      />} />
              <Route path="pomodoro"    element={<Pomodoro    />} />
              <Route path="reminders"   element={<Reminders   />} />
              <Route path="analytics"   element={<Analytics   />} />
              <Route path="revision"    element={<Revision    />} />
              <Route path="planner"     element={<Planner     />} />
              <Route path="profile"     element={<Profile     />} />
              <Route path="assistant"   element={<Assistant   />} />
              <Route path="workspace"   element={<Workspace   />} />
              <Route path="library"     element={<Library     />} />
            </Route>
          </Routes>
        </IntelligenceProvider>
      </PomodoroProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
