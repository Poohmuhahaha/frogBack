// Jest setup file for backend tests
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/academic_content_test';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods in tests if needed
// global.console = {
//   ...console,
//   warn: jest.fn(),
//   error: jest.fn(),
// };