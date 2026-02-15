'use client'

import { useState } from 'react'

export default function TestDailyPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testDailyConnection = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/daily/test')
      const data = await response.json()
      
      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || 'Test failed')
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-8">Daily.co Connection Test</h1>
        
        <button
          onClick={testDailyConnection}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
        >
          {loading ? 'Testing...' : 'Test Daily.co Connection'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {result.success ? '✅ Connection Successful!' : '❌ Connection Failed'}
            </h2>
            
            {result.success && (
              <div className="space-y-2 mb-4">
                <p><strong>Message:</strong> {result.message}</p>
                {result.testRoom && (
                  <div className="mt-4 p-3 bg-green-50 rounded">
                    <p><strong>Test Room Created:</strong></p>
                    <p>URL: <code className="text-sm bg-gray-100 px-2 py-1 rounded">{result.testRoom.url}</code></p>
                    <p>Name: {result.testRoom.name}</p>
                  </div>
                )}
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-sm">View Full Response</summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}

        <div className="mt-6">
          <a
            href="/"
            className="text-blue-600 hover:underline"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
