import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import LoginForm from '../LoginForm';
import authReducer from '../../../store/slices/authSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the login mutation
const mockLoginMutation = jest.fn();
jest.mock('../../../store/api/authApi', () => ({
  useLoginMutation: () => [mockLoginMutation, { isLoading: false }],
}));

// Mock navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock store for testing
const createTestStore = () => configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
});

const renderWithProviders = (component: React.ReactElement) => {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </Provider>
  );
};

describe('LoginForm Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders login form elements', () => {
    renderWithProviders(<LoginForm />);
    
    expect(screen.getByLabelText(/employee id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('updates input values when typing', () => {
    renderWithProviders(<LoginForm />);
    
    const employeeIdInput = screen.getByLabelText(/employee id/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    fireEvent.change(employeeIdInput, { target: { value: 'EMP001' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(employeeIdInput.value).toBe('EMP001');
    expect(passwordInput.value).toBe('password123');
  });

  test('calls login mutation on form submission', () => {
    mockLoginMutation.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    
    renderWithProviders(<LoginForm />);
    
    const employeeIdInput = screen.getByLabelText(/employee id/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /login/i });

    fireEvent.change(employeeIdInput, { target: { value: 'EMP001' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    expect(mockLoginMutation).toHaveBeenCalledWith({
      employeeId: 'EMP001',
      password: 'password123'
    });
  });

  test('form validation prevents empty submission', () => {
    renderWithProviders(<LoginForm />);
    
    const employeeIdInput = screen.getByLabelText(/employee id/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(employeeIdInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('required');
  });
});