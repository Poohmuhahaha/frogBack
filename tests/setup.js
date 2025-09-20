"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Jest setup file for backend tests
const dotenv_1 = require("dotenv");
// Load test environment variables
(0, dotenv_1.config)({ path: '.env.test' });
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
//# sourceMappingURL=setup.js.map