import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import EmployeeManagement from '../EmployeeManagement';
import { apiSlice } from '../../../store/api/apiSlice';
import authSlice from '../../../store/slices/authSlice';
import offlineSlice from '../../../store/slices/offlineSlice';

// Mock the API with error state
jest.mock('../../../store/api/employeeApi', () => ({
  useGetEmployeesQuery: () => ({
    data: null,
    isLoading: false,
    error: { message: 'Failed to load' },
    refetch: jest.fn(),
  }),
  useGetEmployeeStatsQuery: () => ({
    data: null,
  }),
  useDeleteEmployeeMutation: () => [jest.fn(), { isLoading: false }],
  useBulkEmployeeOperationMutation: () => [jest.fn(), { isLoading: false }],
}));

const createMockStore = () => {
  return configureStore({
    reducer: {
      api: apiSlice.reducer,
      auth: authSlice,
      offline: offlineSlice,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware),
  });
};

const renderWithProvider = (component: React.ReactElement) => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      {component}
    </Provider>
  );
};

describe('EmployeeManagement Error States', () => {
  it('displays error state when API fails', () => {
    renderWithProvider(<EmployeeManagement />);
    
    expect(screen.getByText('Failed to load employees. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});