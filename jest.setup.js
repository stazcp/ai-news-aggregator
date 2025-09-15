// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.DISABLE_REDIS = 'true' // Use memory cache for tests
