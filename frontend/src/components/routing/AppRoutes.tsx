import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from '../auth/LoginForm';
import ProtectedRoute from '../auth/ProtectedRoute';
import EmployeeDashboard from '../employee/EmployeeDashboard';
import ManagerDashboard from '../manager/ManagerDashboard';
import AdminDashboard from '../admin/AdminDashboard';
import UnauthorizedPage from '../common/UnauthorizedPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginForm />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      
      <Route 
        path="/employee/*" 
        element={
          <ProtectedRoute allowedRoles={['employee', 'manager', 'admin']}>
            <EmployeeDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/manager/*" 
        element={
          <ProtectedRoute allowedRoles={['manager', 'admin']}>
            <ManagerDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRoutes;