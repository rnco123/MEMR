'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function SentryTestPage() {
  const [message, setMessage] = useState<string>('')

  // Example 1: Trigger a JavaScript error
  const triggerError = () => {
    try {
      // This will trigger a test error
      throw new Error('Sentry test error - this is intentional for testing')
    } catch (error) {
      // Use Sentry.captureException to capture and log the error
      Sentry.captureException(error)
      setMessage('✅ Error sent to Sentry! Check your Sentry dashboard.')
    }
  }

  // Example 2: Send a test message
  const triggerMessage = () => {
    Sentry.captureMessage('Test message from Sentry test page', 'info')
    setMessage('✅ Message sent to Sentry! Check your Sentry dashboard.')
  }

  // Example 3: Trigger an unhandled error (will be caught by ErrorBoundary)
  const triggerUnhandledError = () => {
    // This will cause an unhandled error that ErrorBoundary will catch
    throw new Error('Unhandled test error - should be caught by ErrorBoundary')
  }

  // Example 4: Test with context
  const triggerErrorWithContext = () => {
    Sentry.withScope((scope) => {
      scope.setTag('test-type', 'manual-test')
      scope.setLevel('error')
      scope.setContext('test', {
        page: 'sentry-test',
        action: 'manual-error-trigger',
        timestamp: new Date().toISOString(),
      })
      Sentry.captureException(new Error('Test error with custom context'))
      setMessage('✅ Error with context sent to Sentry!')
    })
  }

  // Example 5: Test performance monitoring
  const testPerformance = () => {
    Sentry.startSpan(
      {
        op: 'test.operation',
        name: 'Test Performance Span',
      },
      (span) => {
        // Simulate some work
        const start = Date.now()
        while (Date.now() - start < 100) {
          // Busy wait for 100ms
        }
        span?.setAttribute('duration', Date.now() - start)
        setMessage('✅ Performance span sent to Sentry! Check Performance tab.')
      }
    )
  }

  // Example 6: Test API error simulation
  const testApiError = async () => {
    try {
      // Simulate an API call that fails
      const response = await fetch('/api/nonexistent-endpoint')
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          errorType: 'api_error',
          endpoint: '/api/nonexistent-endpoint',
        },
      })
      setMessage('✅ API error simulation sent to Sentry!')
    }
  }

  // Example 7: Test Sentry logger (if available)
  const testSentryLogger = () => {
    try {
      // Try to use Sentry.logger if available
      if (typeof (Sentry as any).logger?.info === 'function') {
        ;(Sentry as any).logger.info('User triggered test log', {
          log_source: 'sentry_test',
        })
        setMessage('✅ Sentry logger info sent! Check Logs tab in Sentry.')
      } else {
        // Fallback: use console.log which should be captured by consoleLoggingIntegration
        console.log('Test log message - should be captured by Sentry', {
          log_source: 'sentry_test',
          timestamp: new Date().toISOString(),
        })
        setMessage('✅ Console log sent! Check Logs tab in Sentry (via consoleLoggingIntegration).')
      }
    } catch (error) {
      setMessage('⚠️ Logger not available, but console.log should still work')
    }
  }

  // Example 8: Test different console log levels
  const testConsoleLogs = () => {
    console.log('Test console.log message', { level: 'log', source: 'sentry_test' })
    console.warn('Test console.warn message', { level: 'warn', source: 'sentry_test' })
    console.error('Test console.error message', { level: 'error', source: 'sentry_test' })
    setMessage('✅ Console logs (log, warn, error) sent! Check Logs tab in Sentry.')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Sentry Error Tracking Test</h1>
          <p className="text-blue-200 mb-8">
            Use the buttons below to trigger different types of errors and verify they appear in your Sentry dashboard.
          </p>

          {message && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
              <p className="text-green-200">{message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Test 1: Basic Error */}
            <button
              onClick={triggerError}
              className="px-6 py-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">1. Trigger JavaScript Error</div>
              <div className="text-sm text-red-300/70">
                Captures a handled exception using captureException
              </div>
            </button>

            {/* Test 2: Test Message */}
            <button
              onClick={triggerMessage}
              className="px-6 py-4 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">2. Send Test Message</div>
              <div className="text-sm text-blue-300/70">
                Sends an info-level message to Sentry
              </div>
            </button>

            {/* Test 3: Unhandled Error */}
            <button
              onClick={triggerUnhandledError}
              className="px-6 py-4 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">3. Trigger Unhandled Error</div>
              <div className="text-sm text-orange-300/70">
                Will be caught by ErrorBoundary
              </div>
            </button>

            {/* Test 4: Error with Context */}
            <button
              onClick={triggerErrorWithContext}
              className="px-6 py-4 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">4. Error with Context</div>
              <div className="text-sm text-purple-300/70">
                Includes custom tags and context data
              </div>
            </button>

            {/* Test 5: Performance */}
            <button
              onClick={testPerformance}
              className="px-6 py-4 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">5. Test Performance</div>
              <div className="text-sm text-green-300/70">
                Creates a performance span
              </div>
            </button>

            {/* Test 6: API Error */}
            <button
              onClick={testApiError}
              className="px-6 py-4 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">6. Simulate API Error</div>
              <div className="text-sm text-yellow-300/70">
                Tests API error handling
              </div>
            </button>

            {/* Test 7: Sentry Logger */}
            <button
              onClick={testSentryLogger}
              className="px-6 py-4 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 text-indigo-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">7. Test Sentry Logger</div>
              <div className="text-sm text-indigo-300/70">
                Sends log using Sentry.logger.info()
              </div>
            </button>

            {/* Test 8: Console Logs */}
            <button
              onClick={testConsoleLogs}
              className="px-6 py-4 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-200 rounded-xl font-medium transition-colors text-left"
            >
              <div className="font-bold mb-1">8. Test Console Logs</div>
              <div className="text-sm text-teal-300/70">
                Tests console.log, warn, and error capture
              </div>
            </button>
          </div>

          <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">How to Verify:</h2>
            <ol className="list-decimal list-inside space-y-2 text-blue-200 text-sm">
              <li>Click any button above to trigger an error or log</li>
              <li>Go to your Sentry dashboard: <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">sentry.io</a></li>
              <li>Navigate to: <strong>Issues</strong>, <strong>Performance</strong>, or <strong>Logs</strong> tab</li>
              <li>You should see the error/log appear within a few seconds</li>
              <li>Click on the error/log to see detailed information</li>
              <li>For logs: Check the <strong>Logs</strong> section in your Sentry project</li>
            </ol>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> If you don&apos;t see events in Sentry, check:
            </p>
            <ul className="list-disc list-inside text-sm text-yellow-800 mt-2 space-y-1">
              <li>Your DSN is set in <code className="bg-yellow-100 px-1 rounded">.env.local</code></li>
              <li>You&apos;ve restarted your dev server after adding the DSN</li>
              <li>Your Sentry project is configured correctly</li>
              <li>Check browser console for any errors</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
