// Jest setup file

// Mock uuid to use CommonJS version
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++uuidCounter}`),
}));

// Mock sharp
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    jpeg: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed image')),
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 })
  }));
  return mockSharp;
});

// Mock archiver
jest.mock('archiver', () => {
  const mockArchiver = jest.fn(() => ({
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined)
  }));
  return mockArchiver;
});

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('test file')),
  unlink: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined)
}));

// Set test environment variables
process.env.JWT_SECRET = 'test-secret';
process.env.FACE_RECOGNITION_ENABLED = 'true';