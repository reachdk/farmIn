import React from 'react';
import { Link } from 'react-router-dom';

const UnauthorizedPage: React.FC = () => {
  return (
    <div className="unauthorized-page">
      <h1>Unauthorized</h1>
      <p>You don't have permission to access this page.</p>
      <Link to="/login">Go to Login</Link>
    </div>
  );
};

export default UnauthorizedPage;