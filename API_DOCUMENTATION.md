# API Documentation

This document describes all API endpoints in MyclinicMD.

## Base URL

- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Authentication

Most endpoints require authentication via Supabase Auth. Include the session cookie in requests.

## Endpoints

### Health Check

**GET** `/api/health`

Check application health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "database": "healthy",
  "version": "1.0.0"
}
```

---

### Authentication

#### Sign Up

**POST** `/api/signup`

Create a new user account (admin only).

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "role": "doctor",
  "pin": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "john@example.com"
  }
}
```

**Errors:**
- `400` - Validation error
- `401` - Invalid PIN
- `429` - Rate limit exceeded

#### Sign Out

**POST** `/api/auth/signout`

Sign out the current user.

**Response:**
```json
{
  "success": true
}
```

---

### Patients

#### Get Patient Documents

**GET** `/api/patients/[id]/documents`

Get all documents for a patient.

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "patient_id": 123,
      "document_name": "Insurance Card",
      "document_label": "image",
      "file_url": "https://...",
      "uploaded_by_name": "Dr. Smith",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### Upload Document

**POST** `/api/patients/[id]/documents`

Upload a document for a patient.

**Request (FormData):**
- `file`: File object
- `document_name`: string
- `document_label`: 'image' | 'report' | 'bill' | 'prescription' | 'lab_result' | 'xray' | 'other'

**Response:**
```json
{
  "document": {
    "id": "uuid",
    "patient_id": 123,
    "document_name": "Insurance Card",
    "file_url": "https://..."
  }
}
```

#### Delete Document

**DELETE** `/api/patients/[id]/documents/[docId]`

Delete a patient document.

**Response:**
```json
{
  "success": true
}
```

---

### Chat

#### Get Conversations

**GET** `/api/chat/conversations`

Get all conversations for the current user.

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "participant1_id": "uuid",
      "participant2_id": "uuid",
      "last_message_at": "2024-01-15T10:00:00Z",
      "other_user": {
        "id": "uuid",
        "full_name": "Dr. Smith",
        "role": "doctor"
      }
    }
  ]
}
```

#### Get Messages

**GET** `/api/chat/messages?conversation_id=uuid`

Get messages for a conversation.

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_id": "uuid",
      "content": "Hello",
      "created_at": "2024-01-15T10:00:00Z",
      "sender": {
        "id": "uuid",
        "full_name": "Dr. Smith",
        "role": "doctor"
      }
    }
  ]
}
```

#### Send Message

**POST** `/api/chat/messages`

Send a message in a conversation.

**Request Body:**
```json
{
  "conversation_id": "uuid",
  "content": "Hello, how can I help?"
}
```

**Response:**
```json
{
  "message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "content": "Hello, how can I help?",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

#### Get Users

**GET** `/api/chat/users`

Get all users for chat (doctors, nurses, staff).

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "full_name": "Dr. Smith",
      "role": "doctor",
      "email": "doctor@example.com"
    }
  ]
}
```

---

### Daily.co

#### Create Room

**POST** `/api/daily/room`

Create a Daily.co video room.

**Request Body:**
```json
{
  "roomName": "optional-room-name"
}
```

**Response:**
```json
{
  "room": {
    "name": "room-name",
    "url": "https://room-name.daily.co"
  }
}
```

---

### Pharmacy Integration

#### Fetch Prescriptions (Pharmacy Pull API)

**GET** `/api/pharmacy/prescriptions`

Pharmacy-facing endpoint. External pharmacy systems call this endpoint to fetch prescriptions assigned to that pharmacy.

**Authentication:**
- `Authorization: Bearer <pharmacy_api_key>`
- or `x-api-key: <pharmacy_api_key>`

**Query Params:**
- `since` (optional, ISO datetime): return rows created at/after this time
- `limit` (optional, default `100`, max `200`)
- `include_cancelled` (optional, `true|false`, default `false`)

**Response:**
```json
{
  "success": true,
  "pharmacy_id": 7,
  "count": 2,
  "data": [
    {
      "id": 101,
      "patient_id": 42,
      "encounter_id": 88,
      "medication_name": "Amoxicillin 500mg",
      "dosage": "1 capsule",
      "instructions": "Take twice daily for 7 days",
      "quantity": "14",
      "refills": 0,
      "status": "recorded",
      "external_rx_id": null,
      "notes": null,
      "created_at": "2026-04-28T00:10:00.000Z",
      "updated_at": "2026-04-28T00:10:00.000Z",
      "pharmacy_id": 7,
      "pharmacy_pulled_at": null
    }
  ]
}
```

**Behavior notes:**
- Returns only prescriptions where `prescriptions.pharmacy_id` matches the API key's pharmacy.
- On successful fetch, first pull timestamp is recorded in `pharmacy_pulled_at`.
- Prescriptions with `status='recorded'` are promoted to `status='sent'` after they are fetched.

---

### Audit

#### Log Audit Event

**POST** `/api/audit`

Log an audit event (for client-side components).

**Request Body:**
```json
{
  "action": "patient_viewed",
  "resource_type": "patient",
  "resource_id": "123",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Error Responses

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

## Rate Limiting

Some endpoints have rate limiting:
- Signup: 5 requests per 15 minutes per IP
- Other endpoints: 10 requests per minute per IP

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (Unix timestamp)

## Authentication

Include the Supabase session cookie in all authenticated requests. The middleware handles session validation automatically.

## Examples

### Using fetch

```typescript
// Authenticated request
const response = await fetch('/api/patients/123/documents', {
  credentials: 'include', // Include cookies
  headers: {
    'Content-Type': 'application/json',
  },
})

const data = await response.json()
```

### Using FormData

```typescript
const formData = new FormData()
formData.append('file', file)
formData.append('document_name', 'Insurance Card')
formData.append('document_label', 'image')

const response = await fetch('/api/patients/123/documents', {
  method: 'POST',
  credentials: 'include',
  body: formData,
})
```
