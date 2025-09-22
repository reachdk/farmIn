import fs from 'fs';
import path from 'path';

describe('Service Worker Configuration', () => {
  let serviceWorkerContent: string;

  beforeAll(() => {
    // Read the actual service worker file
    const swPath = path.join(__dirname, '../../public/sw.js');
    serviceWorkerContent = fs.readFileSync(swPath, 'utf8');
  });

  test('service worker file exists', () => {
    expect(serviceWorkerContent).toBeDefined();
    expect(serviceWorkerContent.length).toBeGreaterThan(0);
  });

  test('service worker has cache configuration', () => {
    expect(serviceWorkerContent).toContain('CACHE_NAME');
    expect(serviceWorkerContent).toContain('farm-attendance');
    expect(serviceWorkerContent).toContain('urlsToCache');
  });

  test('service worker has install event handler', () => {
    expect(serviceWorkerContent).toContain("addEventListener('install'");
    expect(serviceWorkerContent).toContain('caches.open');
    expect(serviceWorkerContent).toContain('cache.addAll');
  });

  test('service worker has fetch event handler for offline support', () => {
    expect(serviceWorkerContent).toContain("addEventListener('fetch'");
    expect(serviceWorkerContent).toContain('caches.match');
    expect(serviceWorkerContent).toContain('response || fetch');
  });

  test('service worker has activate event handler for cache cleanup', () => {
    expect(serviceWorkerContent).toContain("addEventListener('activate'");
    expect(serviceWorkerContent).toContain('caches.keys');
    expect(serviceWorkerContent).toContain('caches.delete');
  });

  test('service worker caches essential app resources', () => {
    // Check that essential resources are in the cache list
    expect(serviceWorkerContent).toContain("'/'");
    expect(serviceWorkerContent).toContain('bundle.js');
    expect(serviceWorkerContent).toContain('main.css');
    expect(serviceWorkerContent).toContain('manifest.json');
  });
});