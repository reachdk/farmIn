import fs from 'fs';
import path from 'path';

describe('PWA Manifest Configuration', () => {
  let manifest: any;

  beforeAll(() => {
    // Read the actual manifest.json file
    const manifestPath = path.join(__dirname, '../../public/manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestContent);
  });

  test('manifest.json exists and is valid JSON', () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe('object');
  });

  test('manifest has required PWA properties', () => {
    // Required properties for a valid PWA manifest
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('theme_color');
    expect(manifest).toHaveProperty('background_color');
    expect(manifest).toHaveProperty('icons');
  });

  test('manifest has correct farm attendance system configuration', () => {
    expect(manifest.name).toBe('Farm Attendance System');
    expect(manifest.short_name).toBe('Farm Attendance');
    expect(manifest.description).toBe('Offline-first farm employee attendance tracking system');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#2e7d32');
    expect(manifest.categories).toContain('productivity');
    expect(manifest.categories).toContain('business');
  });

  test('manifest has proper icon configuration', () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    
    // Check that icons have required properties
    manifest.icons.forEach((icon: any) => {
      expect(icon).toHaveProperty('src');
      expect(icon).toHaveProperty('sizes');
      expect(icon).toHaveProperty('type');
    });
  });

  test('manifest display mode is suitable for PWA', () => {
    const validDisplayModes = ['standalone', 'fullscreen', 'minimal-ui'];
    expect(validDisplayModes).toContain(manifest.display);
  });

  test('manifest start_url is properly configured', () => {
    expect(manifest.start_url).toBe('.');
  });

  test('manifest orientation is set for mobile use', () => {
    expect(manifest.orientation).toBe('portrait');
  });
});