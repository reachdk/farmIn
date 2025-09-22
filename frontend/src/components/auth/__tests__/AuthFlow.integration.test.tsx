import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import AppRoutes from '../../routing/AppRoutes';
import authReducer from '../../../store/slices/authSlice';
import offlineReducer from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the auth API
jest.mock('../../../store/api/authApi', () => ({
  useLoginMutation: () => [jest.fn(), { isLoading: false }],
}));

const createTestStore = (preloadedState?: any) => configureStore({
  reducer: {
    auth: authReducer,
    offline: offlineReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  preloadedState,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
});

const renderApp = (initialRoute = '/', preloadedState?: any) => {
  const store = createTestStore(preloadedState);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes />
      </MemoryRouter>
    </Provider>
  );
};

describe('Authentication Flow Integration', () => {
  test('redirects unauthenticated users to login from protected routes', () => {
    renderApp('/employee');
    expect(screen.getByText('Farm Attendance System')).toBeInTheDocument();
    expect(screen.getByLabelText(/employee id/i)).toBeInTheDocument();
  });

  test('shows employee dashboard when authenticated as employee', () => {
    const authenticatedState = {
      auth: {
        user: {
          id: '1',
          employeeId: 'EMP001',
          name: 'John Doe',
          role: 'employee'
        },
        token: 'mock-token',
        isAuthenticated: true,
      }
    };

    renderApp('/employee', authenticatedState);
    expect(screen.getByText('Employee Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome, John Doe!')).toBeInTheDocument();
  });

  test('shows admin dashboard when authenticated as admin', () => {
    const adminState = {
      auth: {
        user: {
          id: '2',
          employeeId: 'ADMIN001',
          name: 'Admin User',
          role: 'admin'
        },
        token: 'admin-token',
        isAuthenticated: true,
      }
    };

    renderApp('/admin', adminState);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Admin User!')).toBeInTheDocument();
  });

  test('employee cannot access admin routes', () => {
    const employeeState = {
      auth: {
        user: {
          id: '1',
          employeeId: 'EMP001',
          name: 'John Doe',
          role: 'employee'
        },
        token: 'mock-token',
        isAuthenticated: true,
      }
    };

    renderApp('/admin', employeeState);
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  test('manager can access employee routes', () => {
    const managerState = {
      auth: {
        user: {
          id: '3',
          employeeId: 'MGR001',
          name: 'Manager User',
          role: 'manager'
        },
        token: 'manager-token',
        isAuthenticated: true,
      }
    };

    renderApp('/employee', managerState);
    expect(screen.getByText('Employee Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Manager User!')).toBeInTheDocument();
  });

  test('root path redirects to login', () => {
    renderApp('/');
    expect(screen.getByText('Farm Attendance System')).toBeInTheDocument();
    expect(screen.getByLabelText(/employee id/i)).toBeInTheDocument();
  });
});