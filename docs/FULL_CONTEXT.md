# MyclinicMD - Full Context Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Features](#features)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Security Features](#security-features)
7. [File Structure](#file-structure)
8. [Configuration](#configuration)
9. [Development Workflow](#development-workflow)
10. [Deployment](#deployment)
11. [Testing](#testing)
12. [Monitoring & Error Tracking](#monitoring--error-tracking)
13. [Key Libraries & Utilities](#key-libraries--utilities)

---

## Project Overview

**MyclinicMD** is a modern Electronic Medical Records (EMR) system with integrated video conferencing capabilities. It's designed for healthcare providers to manage patient records, appointments, encounters, and conduct telemedicine consultations.

### Purpose
- Digital patient record management
- Appointment scheduling and tracking
- Telemedicine video consultations via Daily.co
- Secure document storage and management
- Real-time chat between healthcare providers
- HIPAA-compliant audit logging

### Target Users
- **Doctors**: Full access to patient records, appointments, and video consultations
- **Nurses**: Access to patient records, appointments, and encounter management
- **Staff**: Administrative access for appointment scheduling and basic patient management

---

## Architecture & Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.9.3
- **Styling**: Tailwind CSS 3.4.19
- **UI Components**: React 18.2.0
- **Video SDK**: @daily-co/daily-js 0.85.0

### Backend
- **Runtime**: Node.js 18+
- **API**: Next.js API Routes (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage

### Infrastructure
- **Hosting**: Vercel (recommended) or any Node.js hosting
- **Database**: Supabase Cloud
- **Video**: Daily.co
- **Error Tracking**: Sentry (optional)

### Development Tools
- **Testing**: Jest 29.7.0, React Testing Library
- **Linting**: ESLint with Next.js config
- **Formatting**: Prettier 3.2.4
- **Type Checking**: TypeScript strict mode

---

## Features

### Core Features

#### 1. Authentication & Authorization
- Secure authentication via Supabase Auth
- Role-based access control (Doctor, Nurse, Staff)
- Session management with auto-refresh
- PIN-protected admin signup

#### 2. Patient Management
- Patient profile creation and management
- Patient document upload and storage
- Patient history tracking
- Patient search and filtering

#### 3. Appointment Scheduling
- Create and manage appointments
- Appointment status tracking
- Location-based appointments
- Service-based scheduling

#### 4. Encounter Management
- Create and track patient encounters
- Link encounters to appointments
- Encounter status management (pending, in-progress, completed, cancelled)
- Intake form integration

#### 5. Video Conferencing
- Daily.co integration for telemedicine
- Room creation and management
- Video call interface
- Secure video sessions

#### 6. Chat System
- Real-time messaging between healthcare providers
- Conversation management
- User profile synchronization
- Message history

#### 7. Document Management
- Patient document uploads
- Document categorization (image, report, bill, prescription, lab_result, xray, other)
- Secure file storage in Supabase Storage
- Document deletion with proper authorization

#### 8. Audit Logging
- Comprehensive audit trail for HIPAA compliance
- Logs all user actions
- Tracks access to Protected Health Information (PHI)
- 7-year retention policy

### Security Features
- Input validation with Zod schemas
- XSS protection via input sanitization
- Rate limiting on API endpoints
- Security headers (XSS, clickjacking protection)
- Row Level Security (RLS) on database tables
- CSRF protection
- IP whitelisting capabilities
- Password strength validation

---

## Database Schema

### Core Tables

#### `profiles`
User profiles linked to Supabase Auth users
- `uid`: UUID` (Primary Key, references auth.users)
- `full_name`: TEXT
- `role`: ENUM (doctor, nurse, staff)
- `email`: TEXT
- `created_at`: TIMESTAMP

#### `patients`
Patient information
- `id`: BIGINT (Primary Key)
- `first_name`: TEXT (Required)
- `last_name`: TEXT (Required)
- `email`: TEXT
- `phone`: TEXT
- `gender`: ENUM
- `date_of_birth`: DATE
- `street_address`: TEXT
- `state`: TEXT
- `zip_code`: TEXT
- `location_id`: BIGINT (Foreign Key → locations)
- `patient_code`: TEXT
- `is_text_opt_in`: BOOLEAN
- `is_check_opt_in`: BOOLEAN
- `last_visit_at`: TIMESTAMP
- `created_at`: TIMESTAMP

#### `appointments`
Appointment scheduling
- `id`: BIGINT (Primary Key)
- `patient_id`: BIGINT (Foreign Key → patients)
- `service_id`: BIGINT (Foreign Key → services)
- `location_id`: BIGINT (Foreign Key → locations)
- `appointment_date`: DATE
- `appointment_time`: TIME
- `onsite_type`: ENUM
- `appointment_code`: TEXT
- `created_at`: TIMESTAMP

#### `encounters`
Patient encounter records
- `id`: BIGINT (Primary Key)
- `appointment_id`: BIGINT (Foreign Key → appointments)
- `patient_id`: BIGINT (Foreign Key → patients)
- `intake_id`: BIGINT (Foreign Key → intake_form)
- `status`: ENUM (pending, in_progress, completed, cancelled)
- `encounter_code`: TEXT
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

#### `intake_form`
Patient intake information
- `id`: BIGINT (Primary Key)
- `appointment_id`: BIGINT (Foreign Key → appointments)
- `chief_complaint`: VARCHAR
- `location`: VARCHAR
- `severity`: INTEGER
- `symptoms_description`: TEXT
- `onset`: DATE
- `relieving_factors`: JSON
- `medical_conditions`: JSON
- `surgeries`: JSON
- `allergies`: JSON
- `current_medications`: JSON
- `fh_diabetes`: BOOLEAN
- `fh_hypertension`: BOOLEAN
- `fh_cancer`: BOOLEAN
- `fh_heart_disease`: BOOLEAN
- `tobacco_use`: BOOLEAN
- `alcohol_use`: BOOLEAN
- `drug_use`: BOOLEAN
- `occupation`: BIGINT (Foreign Key → occupation)
- `cancer_type`: VARCHAR
- `number_of_pregnancies`: INTEGER
- `birth_control`: VARCHAR
- `last_pap_smear_status`: ENUM
- `last_pap_smear_month_year`: VARCHAR
- `mammography_status`: ENUM
- `mammography_month_year`: VARCHAR
- `last_prostate_exam_status`: ENUM
- `last_prostate_exam_month_year`: VARCHAR
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

#### `patient_documents`
Patient document storage metadata
- `id`: UUID (Primary Key)
- `patient_id`: BIGINT (Foreign Key → patients)
- `document_name`: TEXT
- `document_label`: TEXT (image, report, bill, prescription, lab_result, xray, other)
- `file_url`: TEXT
- `uploaded_by`: UUID (Foreign Key → profiles.uid)
- `uploaded_by_name`: TEXT
- `created_at`: TIMESTAMP

#### `conversations`
Chat conversations between users
- `id`: UUID (Primary Key)
- `participant1_id`: UUID (Foreign Key → profiles.uid)
- `participant2_id`: UUID (Foreign Key → profiles.uid)
- `last_message_at`: TIMESTAMP
- `created_at`: TIMESTAMP

#### `messages`
Chat messages
- `id`: UUID (Primary Key)
- `conversation_id`: UUID (Foreign Key → conversations)
- `sender_id`: UUID (Foreign Key → profiles.uid)
- `content`: TEXT
- `created_at`: TIMESTAMP

#### `audit_log`
HIPAA-compliant audit trail
- `id`: BIGSERIAL (Primary Key)
- `user_id`: UUID (Foreign Key → profiles.uid)
- `action`: TEXT
- `resource_type`: TEXT
- `resource_id`: TEXT
- `metadata`: JSONB
- `ip_address`: INET
- `user_agent`: TEXT
- `created_at`: TIMESTAMP

### Supporting Tables
- `locations`: Clinic locations
- `services`: Medical services offered
- `forms`: Dynamic form definitions
- `signed_form`: Signed form storage
- `ai_soapnotes`: AI-generated SOAP notes
- `symptoms`: Symptom catalog
- `occupation`: Occupation reference data

### Database Migrations
Located in `supabase/migrations/`:
1. `001_create_user_profiles.sql` - User profiles
2. `002_create_patients_table_with_rls.sql` - Patients with RLS
3. `003_create_appointments_table_with_rls.sql` - Appointments with RLS
4. `004_update_rls_policies_for_existing_schema.sql` - RLS updates
5. `005_create_patient_documents_table.sql` - Document storage
6. `006_create_missing_tables_for_auth.sql` - Auth tables
7. `007_create_old_schema_tables_linked_to_new.sql` - Schema linking
8. `008_add_missing_columns_to_existing_tables.sql` - Column additions
9. `009_fix_rls_policies_for_new_schema.sql` - RLS fixes
10. `010_rename_pid_to_id_in_patients.sql` - Column rename
11. `011_fix_all_rls_policies_final.sql` - Final RLS fixes
12. `012_create_storage_bucket_policies.sql` - Storage policies
13. `013_add_missing_columns_to_patient_documents.sql` - Document columns
14. `014_create_chat_tables.sql` - Chat system
15. `015_create_profile_trigger.sql` - Profile triggers
16. `016_fix_profiles_rls_for_chat.sql` - Chat RLS
17. `017_add_vitals_rls_policies.sql` - Vitals RLS
18. `018_create_audit_log.sql` - Audit logging
19. `019_add_performance_indexes.sql` - Performance optimization

---

## API Endpoints

### Base URLs
- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

### Authentication
Most endpoints require authentication via Supabase session cookies.

### Endpoints

#### Health Check
- **GET** `/api/health`
  - Returns application health status
  - Response: `{ status: "healthy", timestamp: string, database: "healthy", version: "1.0.0" }`

#### Authentication
- **POST** `/api/signup`
  - Create new user account (admin only, requires PIN)
  - Body: `{ name, email, password, role, pin }`
  - Rate limited: 5 requests per 15 minutes per IP

- **POST** `/api/auth/signout`
  - Sign out current user

- **POST** `/api/auth/test-login`
  - Test login endpoint (development only)

#### Patients
- **GET** `/api/patients/[id]/documents`
  - Get all documents for a patient
  - Returns: `{ documents: Document[] }`

- **POST** `/api/patients/[id]/documents`
  - Upload document for a patient
  - Body: FormData with `file`, `document_name`, `document_label`
  - Returns: `{ document: Document }`

- **DELETE** `/api/patients/[id]/documents/[docId]`
  - Delete a patient document
  - Returns: `{ success: true }`

#### Chat
- **GET** `/api/chat/conversations`
  - Get all conversations for current user
  - Returns: `{ conversations: Conversation[] }`

- **GET** `/api/chat/messages?conversation_id=uuid`
  - Get messages for a conversation
  - Returns: `{ messages: Message[] }`

- **POST** `/api/chat/messages`
  - Send a message
  - Body: `{ conversation_id, content }`
  - Returns: `{ message: Message }`

- **GET** `/api/chat/users`
  - Get all users for chat (doctors, nurses, staff)
  - Returns: `{ users: User[] }`

- **POST** `/api/chat/sync-profiles`
  - Sync user profiles for chat

#### Daily.co Video
- **POST** `/api/daily/room`
  - Create a Daily.co video room
  - Body: `{ roomName?: string }`
  - Returns: `{ room: { name: string, url: string } }`

- **GET** `/api/daily/test`
  - Test Daily.co connection

#### Doctors
- **GET** `/api/doctors/availability`
  - Get doctor availability

#### Audit
- **POST** `/api/audit`
  - Log audit event (client-side)
  - Body: `{ action, resource_type, resource_id, metadata }`
  - Returns: `{ success: true }`

#### Testing
- **GET** `/api/test-db-connection`
  - Test database connection

### Error Responses
All endpoints return errors in this format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Status Codes:**
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

### Rate Limiting
- Signup: 5 requests per 15 minutes per IP
- Other endpoints: 10 requests per minute per IP (configurable)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Security Features

### Authentication & Authorization
- **Supabase Auth**: Secure authentication with PKCE flow
- **Role-Based Access Control**: Doctor, Nurse, Staff roles
- **Row Level Security (RLS)**: Database-level access control
- **Session Management**: Secure session handling with auto-refresh
- **PIN-Protected Signup**: Admin signup requires secure PIN

### Data Protection
- **Encryption at Rest**: Supabase handles database encryption
- **Encryption in Transit**: HTTPS/TLS for all communications
- **Input Validation**: Zod schemas for all user inputs
- **Input Sanitization**: XSS protection utilities (`lib/sanitize.ts`)
- **SQL Injection Prevention**: Parameterized queries via Supabase

### API Security
- **Rate Limiting**: Prevents abuse (`lib/rate-limit.ts`)
- **Error Handling**: No sensitive data in error messages (`lib/api-error-handler.ts`)
- **Audit Logging**: All user actions logged (`lib/audit.ts`)
- **Security Headers**: XSS, clickjacking, and other protections
- **Request Validation**: Request validation middleware (`lib/security/request-validator.ts`)
- **CSRF Protection**: CSRF token validation (`lib/security/csrf.ts`)
- **IP Whitelisting**: IP whitelist capabilities (`lib/security/ip-whitelist.ts`)

### File Upload Security
- **File Type Validation**: Validates file types and extensions
- **File Size Limits**: 10MB maximum file size
- **Secure Storage**: Files stored in Supabase Storage with proper policies
- **Virus Scanning**: Consider adding for production

### HIPAA Compliance
- **Audit Logging**: Comprehensive audit trail
- **Access Control**: Role-based access with minimum necessary principle
- **Data Retention**: 7-year audit log retention
- **Secure Deletion**: Proper data deletion procedures

---

## File Structure

```
MEMR/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard route group
│   │   ├── dashboard/            # Dashboard pages
│   │   │   ├── page.tsx         # Main dashboard
│   │   │   ├── flowboard/       # Doctor flowboard
│   │   │   ├── nurse-flowboard/ # Nurse flowboard
│   │   │   └── patients-history/ # Patient history
│   │   └── layout.tsx            # Dashboard layout
│   ├── api/                      # API routes
│   │   ├── audit/               # Audit logging
│   │   ├── auth/                # Authentication
│   │   ├── chat/                # Chat system
│   │   ├── daily/               # Daily.co integration
│   │   ├── doctors/             # Doctor endpoints
│   │   ├── health/              # Health check
│   │   ├── patients/            # Patient endpoints
│   │   ├── signup/              # User signup
│   │   └── test-db-connection/  # DB testing
│   ├── encounter/               # Encounter pages
│   ├── login/                   # Login page
│   ├── patient-file/            # Patient file view
│   ├── signup/                  # Signup page
│   ├── video/                   # Video call page
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── global-error.tsx         # Global error handler
├── components/                   # React components
│   ├── AssignProviderModal.tsx
│   ├── Chat.tsx
│   ├── EncounterDetailModal.tsx
│   ├── ErrorBoundary.tsx
│   ├── LoadingSpinner.tsx
│   ├── VitalsFormModal.tsx
│   └── README.md
├── lib/                          # Utility libraries
│   ├── security/                # Security utilities
│   │   ├── api-auth.ts
│   │   ├── csrf.ts
│   │   ├── file-upload.ts
│   │   ├── ip-whitelist.ts
│   │   ├── monitoring.ts
│   │   ├── password.ts
│   │   └── request-validator.ts
│   ├── supabase/                # Supabase clients
│   │   ├── client.ts            # Client-side Supabase
│   │   └── server.ts            # Server-side Supabase
│   ├── utils/                   # Utility functions
│   │   └── role-utils.ts
│   ├── hoc/                     # Higher-order components
│   │   └── withRoleProtection.tsx
│   ├── api-error-handler.ts     # API error handling
│   ├── audit.ts                 # Audit logging
│   ├── auth-context.tsx         # Auth context provider
│   ├── cache.ts                 # Caching utilities
│   ├── config.ts                # Configuration
│   ├── daily.ts                 # Daily.co integration
│   ├── encounter-status.ts      # Encounter status
│   ├── rate-limit.ts            # Rate limiting
│   ├── roles.ts                 # Role definitions
│   ├── sanitize.ts              # Input sanitization
│   └── validation.ts            # Zod validation schemas
├── supabase/                    # Supabase configuration
│   ├── migrations/              # Database migrations
│   ├── README.md
│   └── REALTIME_SETUP.md
├── __tests__/                   # Test files
│   └── lib/
│       ├── roles.test.ts
│       └── validation.test.ts
├── public/                       # Static assets
│   └── favicon.svg
├── middleware.ts                # Next.js middleware
├── instrumentation.ts           # Next.js instrumentation
├── sentry.client.config.ts       # Sentry client config
├── sentry.edge.config.ts         # Sentry edge config
├── sentry.server.config.ts       # Sentry server config
├── next.config.js               # Next.js configuration
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest configuration
├── jest.setup.js                # Jest setup
├── package.json                 # Dependencies
└── Documentation files:
    ├── README.md
    ├── API_DOCUMENTATION.md
    ├── SECURITY.md
    ├── PRODUCTION_READINESS.md
    ├── PRODUCTION_DEPLOYMENT.md
    ├── BEST_PRACTICES_APPLIED.md
    ├── schema.md
    └── [Other documentation files]
```

---

## Configuration

### Environment Variables

#### Required
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Daily.co
NEXT_PUBLIC_DAILY_API_KEY=your_daily_api_key
NEXT_PUBLIC_DAILY_DOMAIN=your_daily_domain

# Admin
ADMIN_SIGNUP_PIN=your_secure_4_digit_pin

# Environment
NODE_ENV=production
```

#### Optional
```bash
# Sentry (Error Tracking)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### Configuration File
Centralized configuration in `lib/config.ts`:
- Validates environment variables
- Throws errors on missing required variables (production only)
- Provides type-safe configuration access

### Next.js Configuration
- **App Router**: Enabled
- **TypeScript**: Strict mode
- **Security Headers**: Configured
- **Image Optimization**: Enabled
- **Production Optimizations**: Enabled

### Supabase Configuration
- **Storage Bucket**: `patient-documents`
  - Public: Yes
  - File size limit: 10MB
  - Policies: Configured for role-based access

### Database Configuration
- **Row Level Security (RLS)**: Enabled on all tables
- **Policies**: Role-based access policies
- **Indexes**: Performance indexes on frequently queried columns

---

## Development Workflow

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Supabase account and project
- Daily.co account

### Setup

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Environment Variables**
   - Copy `.env.local.example` to `.env.local`
   - Fill in all required environment variables

3. **Database Migrations**
   - Run all migrations in `supabase/migrations/` in order
   - Execute in Supabase SQL Editor

4. **Storage Setup**
   - Create `patient-documents` bucket in Supabase Storage
   - Configure bucket policies

5. **Run Development Server**
   ```bash
   npm run dev
   ```

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint errors
npm run type-check       # TypeScript type checking
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting

# Testing
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
```

### Development Best Practices

1. **Type Safety**: Always use TypeScript types
2. **Validation**: Use Zod schemas for all inputs
3. **Error Handling**: Use `apiErrorHandler` for API errors
4. **Security**: Never commit secrets, use environment variables
5. **Testing**: Write tests for critical functions
6. **Code Style**: Follow ESLint and Prettier rules

---

## Deployment

### Pre-Deployment Checklist

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Dependencies installed
- [ ] Security headers verified
- [ ] Error tracking configured (Sentry)
- [ ] Audit logging enabled
- [ ] Rate limiting tested
- [ ] Health check working
- [ ] HTTPS enabled
- [ ] Backups configured

### Vercel Deployment (Recommended)

1. **Connect Repository**
   - Connect GitHub/GitLab repository to Vercel

2. **Configure Environment Variables**
   - Add all required environment variables in Vercel dashboard

3. **Build Settings**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **Deploy**
   - Push to main branch triggers automatic deployment
   - Or deploy manually from Vercel dashboard

### Other Platforms

#### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

#### Manual Deployment
1. Build the application: `npm run build`
2. Start the server: `npm start`
3. Ensure Node.js 18+ is installed
4. Set all environment variables

### Post-Deployment

1. **Verify Health Check**
   - Visit `/api/health` endpoint

2. **Test Authentication**
   - Test login and signup flows

3. **Verify Database Connection**
   - Test database queries

4. **Monitor Errors**
   - Check Sentry (if configured) for errors

5. **Review Audit Logs**
   - Verify audit logging is working

---

## Testing

### Test Structure
- **Unit Tests**: `__tests__/lib/`
- **Test Setup**: `jest.setup.js`
- **Configuration**: `jest.config.js`

### Running Tests
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

### Test Examples
- `__tests__/lib/roles.test.ts` - Role utility tests
- `__tests__/lib/validation.test.ts` - Validation schema tests

### Testing Best Practices
- Test critical business logic
- Test security functions
- Test validation schemas
- Mock external dependencies
- Use React Testing Library for components

---

## Monitoring & Error Tracking

### Sentry Integration
- **Client-side**: `sentry.client.config.ts`
- **Server-side**: `sentry.server.config.ts`
- **Edge**: `sentry.edge.config.ts`
- **Instrumentation**: `instrumentation.ts`

### Error Boundaries
- **Global Error Boundary**: `components/ErrorBoundary.tsx`
- **Global Error Page**: `app/global-error.tsx`

### Health Monitoring
- **Health Check Endpoint**: `/api/health`
- Returns: status, timestamp, database health, version

### Audit Logging
- **Audit Log Table**: `audit_log`
- **Audit API**: `/api/audit`
- **Audit Library**: `lib/audit.ts`
- Logs all user actions for HIPAA compliance

### Monitoring Best Practices
- Set up alerts for errors
- Monitor API response times
- Track rate limit violations
- Review audit logs regularly
- Monitor database performance

---

## Key Libraries & Utilities

### Core Libraries

#### `lib/config.ts`
- Centralized configuration
- Environment variable validation
- Type-safe config access

#### `lib/validation.ts`
- Zod validation schemas
- Input validation for all API endpoints
- Type-safe validation

#### `lib/roles.ts`
- Role definitions (Doctor, Nurse, Staff)
- Role validation utilities
- Role enum mapping

#### `lib/audit.ts`
- Audit logging functions
- HIPAA-compliant logging
- Action tracking

#### `lib/api-error-handler.ts`
- Standardized error responses
- Error code mapping
- Safe error messages (no sensitive data)

#### `lib/rate-limit.ts`
- Rate limiting implementation
- IP-based limiting
- Configurable limits

#### `lib/sanitize.ts`
- XSS protection
- Input sanitization
- HTML escaping

### Security Libraries

#### `lib/security/request-validator.ts`
- Request validation
- Security checks

#### `lib/security/password.ts`
- Password strength validation
- Password hashing utilities

#### `lib/security/file-upload.ts`
- File upload validation
- File type checking
- File size limits

#### `lib/security/csrf.ts`
- CSRF token generation
- CSRF validation

#### `lib/security/api-auth.ts`
- API authentication
- Token validation

#### `lib/security/ip-whitelist.ts`
- IP whitelisting
- Access control

#### `lib/security/monitoring.ts`
- Security monitoring
- Threat detection

### Supabase Utilities

#### `lib/supabase/client.ts`
- Client-side Supabase client
- Browser usage

#### `lib/supabase/server.ts`
- Server-side Supabase client
- Server components and API routes

### Other Utilities

#### `lib/daily.ts`
- Daily.co integration
- Room creation
- Video session management

#### `lib/cache.ts`
- Caching utilities
- Next.js cache helpers

#### `lib/encounter-status.ts`
- Encounter status definitions
- Status validation

#### `lib/auth-context.tsx`
- React context for authentication
- User session management

---

## Additional Resources

### Documentation Files
- `README.md` - Project overview and setup
- `API_DOCUMENTATION.md` - Complete API reference
- `SECURITY.md` - Security practices and procedures
- `PRODUCTION_READINESS.md` - Production checklist
- `PRODUCTION_DEPLOYMENT.md` - Deployment guide
- `BEST_PRACTICES_APPLIED.md` - Code quality improvements
- `schema.md` - Database schema reference
- `OWASP_TOP10_MAPPING.md` - Security mapping
- `SECURITY_ASSESSMENT.md` - Security assessment
- `SECURITY_ENHANCEMENTS.md` - Security improvements
- `DEPENDENCY_UPDATE_POLICY.md` - Dependency management
- `VERCEL_DEPLOYMENT_CHECKLIST.md` - Vercel deployment guide

### External Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Daily.co Documentation](https://docs.daily.co)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Zod Documentation](https://zod.dev)

---

## Project Status

### Current Version
- **Version**: 1.0.0
- **Status**: Production Ready
- **Last Updated**: 2024-01-15

### Production Readiness
✅ **Completed:**
- Security enhancements
- Error handling & monitoring
- HIPAA compliance (audit logging)
- Performance optimizations
- Testing infrastructure
- Code quality improvements
- Documentation

### Known Limitations
- Some console logs remain for debugging (video page)
- CSS warnings from Tailwind (expected, can be ignored)

### Future Enhancements
- Additional error boundaries
- Skeleton loaders for better UX
- Accessibility improvements (ARIA labels, keyboard navigation)
- Expanded test coverage
- Enhanced monitoring and alerting

---

## Support & Contact

For issues, questions, or contributions:
1. Review existing documentation
2. Check GitHub issues (if applicable)
3. Contact development team

---

**Document Version**: 1.0.0  
**Last Updated**: 2024-01-15  
**Maintained By**: MyclinicMD Development Team
