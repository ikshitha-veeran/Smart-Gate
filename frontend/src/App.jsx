import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoadingScreen from './components/LoadingScreen';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/StudentDashboard';
import AdvisorDashboard from './pages/AdvisorDashboard';
import HodDashboard from './pages/HodDashboard';
import SecurityDashboard from './pages/SecurityDashboard';

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, loading, dbUser, selectedRole } = useAuth();

  if (loading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(dbUser?.role)) {
    // Redirect to their correct dashboard
    const dashboardRoutes = {
      student: '/student',
      advisor: '/advisor',
      hod: '/hod',
      security: '/security',
    };
    return <Navigate to={dashboardRoutes[dbUser?.role] || '/'} replace />;
  }

  return children;
}

// Public Route (redirect if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, loading, dbUser } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (isAuthenticated && dbUser) {
    const dashboardRoutes = {
      student: '/student',
      advisor: '/advisor',
      hod: '/hod',
      security: '/security',
    };
    return <Navigate to={dashboardRoutes[dbUser.role] || '/'} replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Student Dashboard */}
      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentDashboard />
          </ProtectedRoute>
        }
      />

      {/* Advisor Dashboard */}
      <Route
        path="/advisor"
        element={
          <ProtectedRoute allowedRoles={['advisor']}>
            <AdvisorDashboard />
          </ProtectedRoute>
        }
      />

      {/* HOD Dashboard */}
      <Route
        path="/hod"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodDashboard />
          </ProtectedRoute>
        }
      />

      {/* Security Dashboard */}
      <Route
        path="/security"
        element={
          <ProtectedRoute allowedRoles={['security']}>
            <SecurityDashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
