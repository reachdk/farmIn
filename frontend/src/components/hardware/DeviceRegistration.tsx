import React, { useState } from 'react';
import { useRegisterDeviceMutation, DeviceRegistration as DeviceRegistrationData } from '../../store/api/hardwareApi';
import './DeviceRegistration.css';

interface DeviceRegistrationProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  type: 'kiosk' | 'rfid_reader' | 'camera';
  location: string;
  ipAddress: string;
  capabilities: string[];
  configuration: Record<string, any>;
}

interface FormErrors {
  name?: string;
  type?: string;
  location?: string;
  ipAddress?: string;
  capabilities?: string;
  general?: string;
}

const DeviceRegistration: React.FC<DeviceRegistrationProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'kiosk',
    location: '',
    ipAddress: '',
    capabilities: [],
    configuration: {},
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [registerDevice] = useRegisterDeviceMutation();

  const availableCapabilities = {
    kiosk: ['display', 'touchscreen', 'rfid', 'camera', 'audio', 'network'],
    rfid_reader: ['rfid', 'network', 'led_indicator'],
    camera: ['camera', 'network', 'motion_detection', 'night_vision'],
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Device name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Device name must be at least 3 characters';
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    if (!formData.ipAddress.trim()) {
      newErrors.ipAddress = 'IP address is required';
    } else if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(formData.ipAddress.trim())) {
      newErrors.ipAddress = 'Invalid IP address format';
    }

    if (formData.capabilities.length === 0) {
      newErrors.capabilities = 'At least one capability must be selected';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCapabilityChange = (capability: string, checked: boolean) => {
    const newCapabilities = checked
      ? [...formData.capabilities, capability]
      : formData.capabilities.filter(c => c !== capability);
    
    handleInputChange('capabilities', newCapabilities);
  };

  const handleTypeChange = (newType: 'kiosk' | 'rfid_reader' | 'camera') => {
    handleInputChange('type', newType);
    // Reset capabilities when type changes
    handleInputChange('capabilities', []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const registrationData: DeviceRegistrationData = {
        name: formData.name.trim(),
        type: formData.type,
        location: formData.location.trim(),
        ipAddress: formData.ipAddress.trim(),
        capabilities: formData.capabilities,
        configuration: formData.configuration,
      };

      await registerDevice(registrationData).unwrap();
      onSuccess();
    } catch (error: any) {
      console.error('Device registration error:', error);
      
      if (error.data?.message) {
        setErrors({ general: error.data.message });
      } else if (error.data?.errors) {
        setErrors(error.data.errors);
      } else {
        setErrors({ general: 'Failed to register device. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="device-registration-overlay">
      <div className="device-registration-modal">
        <div className="registration-header">
          <h3>Register New Device</h3>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="registration-form">
          {errors.general && (
            <div className="error-message general-error">
              {errors.general}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Device Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={errors.name ? 'error' : ''}
                placeholder="e.g., Main Entrance Kiosk"
                maxLength={50}
              />
              {errors.name && (
                <span className="error-text">{errors.name}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="type">Device Type *</label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value as any)}
                className={errors.type ? 'error' : ''}
              >
                <option value="kiosk">Attendance Kiosk</option>
                <option value="rfid_reader">RFID Reader</option>
                <option value="camera">Camera</option>
              </select>
              {errors.type && (
                <span className="error-text">{errors.type}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="location">Location *</label>
              <input
                id="location"
                type="text"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                className={errors.location ? 'error' : ''}
                placeholder="e.g., Main Entrance, Barn 1, Office"
                maxLength={100}
              />
              {errors.location && (
                <span className="error-text">{errors.location}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="ipAddress">IP Address *</label>
              <input
                id="ipAddress"
                type="text"
                value={formData.ipAddress}
                onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                className={errors.ipAddress ? 'error' : ''}
                placeholder="e.g., 192.168.1.100"
              />
              {errors.ipAddress && (
                <span className="error-text">{errors.ipAddress}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Device Capabilities *</label>
            <div className="capabilities-grid">
              {availableCapabilities[formData.type].map((capability) => (
                <label key={capability} className="capability-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.capabilities.includes(capability)}
                    onChange={(e) => handleCapabilityChange(capability, e.target.checked)}
                  />
                  <span className="capability-label">
                    {capability.replace('_', ' ').toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
            {errors.capabilities && (
              <span className="error-text">{errors.capabilities}</span>
            )}
          </div>

          <div className="device-preview">
            <h4>Device Preview</h4>
            <div className="preview-card">
              <div className="preview-header">
                <span className="preview-icon">
                  {formData.type === 'kiosk' ? '🖥️' : formData.type === 'rfid_reader' ? '📱' : '📷'}
                </span>
                <div className="preview-info">
                  <div className="preview-name">{formData.name || 'Unnamed Device'}</div>
                  <div className="preview-location">{formData.location || 'No location'}</div>
                </div>
              </div>
              <div className="preview-details">
                <div className="preview-type">{formData.type.replace('_', ' ').toUpperCase()}</div>
                <div className="preview-ip">{formData.ipAddress || 'No IP'}</div>
                <div className="preview-capabilities">
                  {formData.capabilities.map(cap => (
                    <span key={cap} className="preview-capability">{cap}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeviceRegistration;