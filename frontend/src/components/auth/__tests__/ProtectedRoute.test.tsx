import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import ProtectedRoute from '../ProtectedRoute';
import authReducer from '../../../store/slices/authSlice';

const createTestStore = (initialState: any) => configureStore({
  reducer: {
    auth: authReducer,
  },
  preloadedState: {
    auth: initialState,
  },
});

const TestComponent = () => <div>Protected Content</div>;
const LoginComponent = () => <div>Login Page</div>;
const UnauthorizedComponent = () => <div>Unauthorized Page</div>;

const renderWithAuthAndRouter = (authState: any, initialRoute = '/protected') => {
  const store = createTestStore(authState);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route path="/unauthorized" element={<UnauthorizedComponent />} />
          <Route 
            path="/protected" 
            element={
              <ProtectedRoute>
                <TestComponent />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin-only" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TestComponent />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

describe('ProtectedRoute Integration', () => {
  test('redirects to login when not authenticated', () => {
    const unauthenticatedState = {
      user: null,
      token: null,
      isAuthenticated: false,
    };

    renderWithAuthAndRouter(unauthenticatedState);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  test('renders protected content when authenticated with correct role', () => {
    const authenticatedState = {
      user: { 
        id: '1', 
        employeeId: 'EMP001', 
        name: 'John Doe', 
        role: 'employee' 
      },
      token: 'valid-token',
      isAuthenticated: true,
    };

    renderWithAuthAndRouter(authenticatedState);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  test('redirects to unauthorized when role not allowed', () => {
    const employeeState = {
      user: { 
        id: '1', 
        employeeId: 'EMP001', 
        name: 'John Doe', 
        role: 'employee' 
      },
      token: 'valid-token',
      isAuthenticated: true,
    };

    renderWithAuthAndRouter(employeeState, '/admin-only');
    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  test('allows admin access to admin-only routes', () => {
    const adminState = {
      user: { 
        id: '1', 
        employeeId: 'ADMIN001', 
        name: 'Admin User', 
        role: 'admin' 
      },
      token: 'valid-token',
      isAuthenticated: true,
    };

    renderWithAuthAndRouter(adminState, '/admin-only');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Unauthorized Page')).not.toBeInTheDocument();
  });
});