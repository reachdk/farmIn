import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DeviceRegistration from '../DeviceRegistration';
import { apiSlice } from '../../../store/api/apiSlice';
import authSlice from '../../../store/slices/authSlice';
import offlineSlice from '../../../store/slices/offlineSlice';

// Mock functions for API calls
const mockRegisterDevice = jest.fn();

jest.mock('../../../store/api/hardwareApi', () => ({
  useRegisterDeviceMutation: () => [
    jest.fn().mockImplementation((data) => ({
      unwrap: () => mockRegisterDevice(data)
    })),
    { isLoading: false },
  ],
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

const mockProps = {
  onClose: jest.fn(),
  onSuccess: jest.fn(),
};

describe('DeviceRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterDevice.mockReset();
  });

  it('renders device registration form', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    expect(screen.getByText('Register New Device')).toBeInTheDocument();
    expect(screen.getByLabelText(/Device Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Device Type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location/)).toBeInTheDocument();
    expect(screen.getByLabelText(/IP Address/)).toBeInTheDocument();
    expect(screen.getByText('Device Capabilities *')).toBeInTheDocument();
    expect(screen.getByText('Register Device')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Device name is required')).toBeInTheDocument();
      expect(screen.getByText('Location is required')).toBeInTheDocument();
      expect(screen.getByText('IP address is required')).toBeInTheDocument();
      expect(screen.getByText('At least one capability must be selected')).toBeInTheDocument();
    });
  });

  it('validates device name length', async () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const nameInput = screen.getByLabelText(/Device Name/);
    fireEvent.change(nameInput, { target: { value: 'AB' } });
    
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Device name must be at least 3 characters')).toBeInTheDocument();
    });
  });

  it('validates IP address format', async () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const nameInput = screen.getByLabelText(/Device Name/);
    const locationInput = screen.getByLabelText(/Location/);
    const ipInput = screen.getByLabelText(/IP Address/);
    
    fireEvent.change(nameInput, { target: { value: 'Test Device' } });
    fireEvent.change(locationInput, { target: { value: 'Test Location' } });
    fireEvent.change(ipInput, { target: { value: 'invalid-ip' } });
    
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid IP address format')).toBeInTheDocument();
    });
  });

  it('updates capabilities when device type changes', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    // Initially should show kiosk capabilities
    expect(screen.getByText('DISPLAY')).toBeInTheDocument();
    expect(screen.getByText('TOUCHSCREEN')).toBeInTheDocument();
    expect(screen.getByText('RFID')).toBeInTheDocument();
    expect(screen.getByText('CAMERA')).toBeInTheDocument();
    
    // Change to RFID reader
    const typeSelect = screen.getByLabelText(/Device Type/);
    fireEvent.change(typeSelect, { target: { value: 'rfid_reader' } });
    
    // Should show RFID reader capabilities
    expect(screen.getByText('RFID')).toBeInTheDocument();
    expect(screen.getByText('NETWORK')).toBeInTheDocument();
    expect(screen.getByText('LED INDICATOR')).toBeInTheDocument();
    
    // Should not show kiosk-specific capabilities
    expect(screen.queryByText('TOUCHSCREEN')).not.toBeInTheDocument();
  });

  it('handles capability selection', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const displayCheckbox = screen.getByLabelText('DISPLAY');
    const rfidCheckbox = screen.getByLabelText('RFID');
    
    // Select capabilities
    fireEvent.click(displayCheckbox);
    fireEvent.click(rfidCheckbox);
    
    expect(displayCheckbox).toBeChecked();
    expect(rfidCheckbox).toBeChecked();
    
    // Deselect capability
    fireEvent.click(displayCheckbox);
    expect(displayCheckbox).not.toBeChecked();
  });

  it('updates device preview', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const nameInput = screen.getByLabelText(/Device Name/);
    const locationInput = screen.getByLabelText(/Location/);
    const ipInput = screen.getByLabelText(/IP Address/);
    
    fireEvent.change(nameInput, { target: { value: 'Test Kiosk' } });
    fireEvent.change(locationInput, { target: { value: 'Main Entrance' } });
    fireEvent.change(ipInput, { target: { value: '192.168.1.100' } });
    
    // Check preview updates
    expect(screen.getByText('Test Kiosk')).toBeInTheDocument();
    expect(screen.getByText('Main Entrance')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
  });

  it('submits valid form data', async () => {
    const mockDevice = {
      id: '1',
      name: 'Test Kiosk',
      type: 'kiosk',
      location: 'Main Entrance',
      ipAddress: '192.168.1.100',
      capabilities: ['display', 'rfid'],
      configuration: {},
    };
    
    mockRegisterDevice.mockResolvedValue(mockDevice);
    
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/Device Name/), { target: { value: 'Test Kiosk' } });
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Main Entrance' } });
    fireEvent.change(screen.getByLabelText(/IP Address/), { target: { value: '192.168.1.100' } });
    
    // Select capabilities
    fireEvent.click(screen.getByLabelText('DISPLAY'));
    fireEvent.click(screen.getByLabelText('RFID'));
    
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockRegisterDevice).toHaveBeenCalledWith({
        name: 'Test Kiosk',
        type: 'kiosk',
        location: 'Main Entrance',
        ipAddress: '192.168.1.100',
        capabilities: ['display', 'rfid'],
        configuration: {},
      });
      expect(mockProps.onSuccess).toHaveBeenCalled();
    });
  });

  it('handles API errors', async () => {
    const errorMessage = 'Device with this IP already exists';
    mockRegisterDevice.mockRejectedValue({
      data: { message: errorMessage },
    });
    
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/Device Name/), { target: { value: 'Test Device' } });
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Test Location' } });
    fireEvent.change(screen.getByLabelText(/IP Address/), { target: { value: '192.168.1.100' } });
    fireEvent.click(screen.getByLabelText('DISPLAY'));
    
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('closes form when close button is clicked', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('closes form when cancel button is clicked', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('clears field errors when user starts typing', async () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    // Trigger validation error
    const submitButton = screen.getByText('Register Device');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Device name is required')).toBeInTheDocument();
    });
    
    // Start typing in name field
    const nameInput = screen.getByLabelText(/Device Name/);
    fireEvent.change(nameInput, { target: { value: 'T' } });
    
    // Error should be cleared
    expect(screen.queryByText('Device name is required')).not.toBeInTheDocument();
  });

  it('shows correct device type icon in preview', () => {
    renderWithProvider(<DeviceRegistration {...mockProps} />);
    
    // Default kiosk should show computer icon
    expect(screen.getByText('🖥️')).toBeInTheDocument();
    
    // Change to camera
    const typeSelect = screen.getByLabelText(/Device Type/);
    fireEvent.change(typeSelect, { target: { value: 'camera' } });
    
    expect(screen.getByText('📷')).toBeInTheDocument();
  });
});