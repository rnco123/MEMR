// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

const webStreams = require('node:stream/web')

if (typeof globalThis.TransformStream === 'undefined') {
  globalThis.TransformStream = webStreams.TransformStream
}
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = webStreams.ReadableStream
}
if (typeof globalThis.WritableStream === 'undefined') {
  globalThis.WritableStream = webStreams.WritableStream
}
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value))
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Suppress console errors in tests (optional)
// global.console = {
//   ...console,
//   error: jest.fn(),
//   warn: jest.fn(),
// }
