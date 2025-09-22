import React from 'react';
import { useAppSelector } from '../../hooks/redux';

const AdminDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <p>Welcome, {user?.name}!</p>
      <p>Role: {user?.role}</p>
      {/* Admin functionality will be implemented in task 8 */}
    </div>
  );
};

export default AdminDashboard;