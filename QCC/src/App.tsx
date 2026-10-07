import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { HalfYearProvider } from './lib/halfYear';
import { CyclesProvider } from './lib/cycles';
import { ActivityStepsProvider } from './lib/activitySteps';
import { MeetingSchedulesProvider } from './lib/meetingSchedules';
import { HierarchyProvider } from './lib/hierarchy';
import { ConfirmProvider } from './components/ConfirmDialog';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TeamRegistration from './pages/TeamRegistration';
import Projects from './pages/Projects';
import Workflow from './pages/Workflow';
import ThemeSelection from './components/ThemeSelection';
import Actions from './pages/Actions';
import Meetings from './pages/Meetings';
import MeetingManagement from './pages/MeetingManagement';
import MeetingScheduler from './pages/MeetingScheduler';
import Scheduling from './pages/Scheduling';
import Approvals from './pages/Approvals';
import Reports from './pages/Reports';
import AdminPanel from './pages/AdminPanel';
import Settings from './pages/Settings';
import EvaluationScore from './pages/EvaluationScore';
import ActivityPlan from './pages/ActivityPlan';
import GanttChart from './pages/GanttChart';
import CircleAssessment from './pages/CircleAssessment';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="team-registration" element={<TeamRegistration />} />
        <Route path="projects" element={<Projects />} />
        <Route path="workflow" element={<Workflow />} />
        <Route path="theme-selection" element={<ThemeSelection />} />
        <Route path="actions" element={<Actions />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meeting-management" element={<MeetingManagement />} />
        <Route path="meeting-scheduler" element={<MeetingScheduler />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="settings" element={<Settings />} />
        <Route path="evaluation-score" element={<EvaluationScore />} />
        <Route path="circle-assessment" element={<CircleAssessment />} />
        <Route path="activity-plan" element={<ActivityPlan />} />
        <Route path="gantt-chart" element={<GanttChart />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <AuthProvider>
          <CyclesProvider>
            <HalfYearProvider>
              <ActivityStepsProvider>
                <MeetingSchedulesProvider>
                  <HierarchyProvider>
                    <AppRoutes />
                  </HierarchyProvider>
                </MeetingSchedulesProvider>
              </ActivityStepsProvider>
            </HalfYearProvider>
          </CyclesProvider>
        </AuthProvider>
      </ConfirmProvider>
    </BrowserRouter>
  );
}
