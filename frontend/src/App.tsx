import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Auth/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import ProjectList from "./pages/Projects/ProjectList";
import ProjectDetail from "./pages/Projects/ProjectDetail";
import MilestoneDetail from "./pages/Milestones/MilestoneDetail";
import TaskList from "./pages/Tasks/TaskList";
import TaskDetail from "./pages/Tasks/TaskDetail";
import TaskForm from "./pages/Tasks/TaskForm";
import MyTimesheet from "./pages/Timesheets/MyTimesheet";
import TeamTimesheet from "./pages/Timesheets/TeamTimesheet";
import NotificationsCenter from "./pages/Notifications/NotificationsCenter";
import Leaderboard from "./pages/Leaderboard/Leaderboard";
import ReportsHub from "./pages/Reports/ReportsHub";
import StaffPerformanceDetail from "./pages/Performance/StaffPerformanceDetail";
import AdminPanel from "./pages/Admin/AdminPanel";
import TeamMemberDashboard from "./pages/Dashboard/TeamMemberDashboard";
import LeadershipDashboard from "./pages/Dashboard/LeadershipDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/milestones/:id" element={<MilestoneDetail />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/new" element={<TaskForm />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/tasks/:id/edit" element={<TaskForm />} />
          <Route path="/timesheet" element={<MyTimesheet />} />
          <Route path="/timesheet/team" element={<TeamTimesheet />} />
          <Route path="/notifications" element={<NotificationsCenter />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/reports" element={<ReportsHub />} />
          <Route path="/performance" element={<StaffPerformanceDetail />} />
          <Route path="/performance/:userId" element={<StaffPerformanceDetail />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/dashboard/team" element={<TeamMemberDashboard />} />
          <Route path="/leadership" element={<LeadershipDashboard />} />
        </Route>
      </Route>
    </Routes>
  );
}
