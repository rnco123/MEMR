/**
 * Standardized error handling for API routes
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'AUTHENTICATION_ERROR')
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'AUTHORIZATION_ERROR')
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
  }
}

/**
 * Handle API errors and return appropriate response
 */
export function handleApiError(error: unknown): NextResponse {
  // Handle known AppError instances
  if (error instanceof AppError) {
    const response: any = {
      error: error.message,
      code: error.code,
    }

    if (error.details && process.env.NODE_ENV === 'development') {
      response.details = error.details
    }

    return NextResponse.json(response, { status: error.statusCode })
  }

  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: string[]; message: string }> }
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: zodError.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    )
  }

  // Capture unexpected errors in Sentry
  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: {
        errorType: 'api_error',
        errorHandler: 'handleApiError',
      },
    })
  } else {
    // For non-Error objects, capture as message
    Sentry.captureMessage(`API Error: ${String(error)}`, {
      level: 'error',
      tags: {
        errorType: 'api_error',
        errorHandler: 'handleApiError',
      },
    })
  }
  
  // Also log to console
  console.error('API Error:', error)

  // Return generic error response
  return NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && error instanceof Error
        ? { message: error.message, stack: error.stack }
        : {}),
    },
    { status: 500 }
  )
}

/**
 * Wrapper for API route handlers with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error)
    }
  }) as T
}
