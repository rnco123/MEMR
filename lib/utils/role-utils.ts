// Utility functions for role checking and validation

import type { UserRole } from '../roles'
import { mapRoleToEnum } from '../roles'

/**
 * Extract role from user object (checks metadata first, then can be extended to check database)
 */
export function getRoleFromUser(user: { user_metadata?: { role?: string } } | null): UserRole | null {
  if (!user) return null
  return mapRoleToEnum(user.user_metadata?.role)
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: UserRole | null, requiredRole: UserRole): boolean {
  return userRole === requiredRole
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(userRole: UserRole | null, requiredRoles: UserRole[]): boolean {
  if (!userRole) return false
  return requiredRoles.includes(userRole)
}
