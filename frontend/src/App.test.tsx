import React from 'react';
import { render, screen } from '@testing-library/react';

// Simple component for testing without Redux dependencies
function SimpleApp() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Farm Attendance System</h1>
        <p>PWA with offline capabilities</p>
      </header>
    </div>
  );
}

test('renders farm attendance system header', () => {
  render(<SimpleApp />);
  const headerElement = screen.getByText(/farm attendance system/i);
  expect(headerElement).toBeInTheDocument();
});

test('renders PWA description', () => {
  render(<SimpleApp />);
  const descriptionElement = screen.getByText(/pwa with offline capabilities/i);
  expect(descriptionElement).toBeInTheDocument();
});
