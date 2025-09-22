# Farm Attendance System - API Documentation

This document provides comprehensive API documentation for the Farm Attendance System.

## Table of Contents

1. [Authentication](#authentication)
2. [Employee Management](#employee-management)
3. [Attendance Tracking](#attendance-tracking)
4. [Time Categories](#time-categories)
5. [System Management](#system-management)
6. [Camera Integration](#camera-integration)
7. [Kiosk Interface](#kiosk-interface)
8. [Hardware Integration](#hardware-integration)
9. [Sync Operations](#sync-operations)
10. [Error Handling](#error-handling)

## Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Login

**POST** `/auth/login`

Authenticate a user and receive a JWT token.

**Request Body:**
```json
{
  "employeeNumber": "EMP001",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "employee": {
    "id": "uuid",
    "employeeNumber": "EMP001",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@farm.com",
    "role": "employee",
    "isActive": true
  },
  "expiresIn": "8h"
}
```

### Refresh Token

**POST** `/auth/refresh`

Refresh an existing JWT token.

**Headers:**
```
Authorization: Bearer <current-token>
```

**Response:**
```json
{
  "success": true,
  "token": "new-jwt-token",
  "expiresIn": "8h"
}
```

### Logout

**POST** `/auth/logout`

Invalidate the current token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Employee Management

### Get All Employees

**GET** `/admin/employees`

Retrieve a list of all employees (Admin only).

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 50)
- `sortBy` (string): Sort field (default: lastName)
- `sortOrder` (string): asc or desc (default: asc)
- `search` (string): Search term
- `role` (string): Filter by role
- `isActive` (boolean): Filter by active status

**Response:**
```json
{
  "employees": [
    {
      "id": "uuid",
      "employeeNumber": "EMP001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@farm.com",
      "role": "employee",
      "isActive": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

### Get Employee by ID

**GET** `/admin/employees/:id`

Retrieve a specific employee by ID.

**Response:**
```json
{
  "employee": {
    "id": "uuid",
    "employeeNumber": "EMP001",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@farm.com",
    "role": "employee",
    "isActive": true,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}
```

### Create Employee

**POST** `/admin/employees`

Create a new employee (Admin only).

**Request Body:**
```json
{
  "employeeNumber": "EMP002",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@farm.com",
  "role": "employee",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "employee": {
    "id": "new-uuid",
    "employeeNumber": "EMP002",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@farm.com",
    "role": "employee",
    "isActive": true,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}
```

### Update Employee

**PUT** `/admin/employees/:id`

Update an existing employee (Admin only).

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Johnson",
  "email": "jane.johnson@farm.com",
  "role": "manager"
}
```

**Response:**
```json
{
  "success": true,
  "employee": {
    "id": "uuid",
    "employeeNumber": "EMP002",
    "firstName": "Jane",
    "lastName": "Johnson",
    "email": "jane.johnson@farm.com",
    "role": "manager",
    "isActive": true,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T12:00:00.000Z"
  }
}
```

### Bulk Create Employees

**POST** `/admin/employees/bulk`

Create multiple employees at once (Admin only).

**Request Body:**
```json
{
  "employees": [
    {
      "employeeNumber": "EMP003",
      "firstName": "Bob",
      "lastName": "Wilson",
      "email": "bob.wilson@farm.com",
      "role": "employee"
    },
    {
      "employeeNumber": "EMP004",
      "firstName": "Alice",
      "lastName": "Brown",
      "email": "alice.brown@farm.com",
      "role": "employee"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "created": 2,
  "failed": 0,
  "employees": [
    {
      "id": "uuid1",
      "employeeNumber": "EMP003",
      "firstName": "Bob",
      "lastName": "Wilson",
      "email": "bob.wilson@farm.com",
      "role": "employee",
      "isActive": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    },
    {
      "id": "uuid2",
      "employeeNumber": "EMP004",
      "firstName": "Alice",
      "lastName": "Brown",
      "email": "alice.brown@farm.com",
      "role": "employee",
      "isActive": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

## Attendance Tracking

### Clock In

**POST** `/attendance/clock-in`

Record employee clock-in time.

**Request Body:**
```json
{
  "employeeId": "uuid",
  "location": "Main Gate",
  "notes": "Started morning shift"
}
```

**Response:**
```json
{
  "success": true,
  "record": {
    "id": "attendance-uuid",
    "employeeId": "uuid",
    "clockInTime": "2023-01-01T08:00:00.000Z",
    "clockOutTime": null,
    "totalHours": null,
    "location": "Main Gate",
    "notes": "Started morning shift",
    "createdAt": "2023-01-01T08:00:00.000Z",
    "updatedAt": "2023-01-01T08:00:00.000Z"
  }
}
```

### Clock Out

**POST** `/attendance/clock-out`

Record employee clock-out time.

**Request Body:**
```json
{
  "employeeId": "uuid",
  "location": "Main Gate",
  "notes": "Completed morning shift"
}
```

**Response:**
```json
{
  "success": true,
  "record": {
    "id": "attendance-uuid",
    "employeeId": "uuid",
    "clockInTime": "2023-01-01T08:00:00.000Z",
    "clockOutTime": "2023-01-01T17:00:00.000Z",
    "totalHours": 9,
    "location": "Main Gate",
    "notes": "Completed morning shift",
    "createdAt": "2023-01-01T08:00:00.000Z",
    "updatedAt": "2023-01-01T17:00:00.000Z"
  }
}
```

### Get Current Status

**GET** `/attendance/current/:employeeId`

Get current attendance status for an employee.

**Response:**
```json
{
  "isActive": true,
  "record": {
    "id": "attendance-uuid",
    "employeeId": "uuid",
    "clockInTime": "2023-01-01T08:00:00.000Z",
    "clockOutTime": null,
    "totalHours": null,
    "location": "Main Gate",
    "notes": "Started morning shift",
    "createdAt": "2023-01-01T08:00:00.000Z",
    "updatedAt": "2023-01-01T08:00:00.000Z"
  },
  "hoursWorkedToday": 4.5
}
```

### Get Attendance History

**GET** `/attendance/history/:employeeId`

Get attendance history for an employee.

**Query Parameters:**
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)
- `limit` (number): Number of records (default: 50)
- `page` (number): Page number (default: 1)

**Response:**
```json
{
  "records": [
    {
      "id": "attendance-uuid",
      "employeeId": "uuid",
      "clockInTime": "2023-01-01T08:00:00.000Z",
      "clockOutTime": "2023-01-01T17:00:00.000Z",
      "totalHours": 9,
      "location": "Main Gate",
      "notes": "Regular shift",
      "createdAt": "2023-01-01T08:00:00.000Z",
      "updatedAt": "2023-01-01T17:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  },
  "summary": {
    "totalHours": 180,
    "totalDays": 20,
    "averageHours": 9
  }
}
```

## Time Categories

### Get All Time Categories

**GET** `/admin/time-categories`

Retrieve all time categories (Admin only).

**Response:**
```json
{
  "categories": [
    {
      "id": "category-uuid",
      "name": "Regular Time",
      "minHours": 0,
      "maxHours": 8,
      "payMultiplier": 1.0,
      "color": "#4CAF50",
      "isActive": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    },
    {
      "id": "category-uuid-2",
      "name": "Overtime",
      "minHours": 8,
      "maxHours": 12,
      "payMultiplier": 1.5,
      "color": "#FF9800",
      "isActive": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Time Category

**POST** `/admin/time-categories`

Create a new time category (Admin only).

**Request Body:**
```json
{
  "name": "Double Time",
  "minHours": 12,
  "maxHours": 16,
  "payMultiplier": 2.0,
  "color": "#F44336",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "category": {
    "id": "new-category-uuid",
    "name": "Double Time",
    "minHours": 12,
    "maxHours": 16,
    "payMultiplier": 2.0,
    "color": "#F44336",
    "isActive": true,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}
```

## System Management

### Health Check

**GET** `/system/health`

Basic system health check (Public endpoint).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "database": "connected"
}
```

### Detailed Health Check

**GET** `/system/health/detailed`

Detailed system health information (Admin only).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "database": {
    "status": "connected",
    "statistics": {
      "employee_count": 50,
      "attendance_count": 1000,
      "category_count": 3,
      "pending_sync_count": 0
    }
  },
  "system": {
    "platform": "linux",
    "arch": "x64",
    "nodeVersion": "v18.17.0",
    "hostname": "farm-server",
    "loadAverage": [0.5, 0.3, 0.2],
    "memory": {
      "usage": {
        "rss": "45MB",
        "heapUsed": "32MB",
        "systemUsage": "65%"
      }
    },
    "cpu": {
      "cores": 4
    }
  }
}
```

### System Metrics

**GET** `/system/metrics`

Get system metrics (Admin/Manager only).

**Response:**
```json
{
  "active_employees": 45,
  "total_employees": 50,
  "today_attendance": 40,
  "currently_clocked_in": 35,
  "week_attendance": 200,
  "pending_sync": 0,
  "failed_sync": 0,
  "system": {
    "uptime": 3600,
    "memory_usage_mb": 32,
    "memory_total_mb": 64,
    "cpu_cores": 4,
    "load_average": 0.5,
    "free_memory_mb": 1024,
    "total_memory_mb": 2048
  },
  "timestamp": "2023-01-01T12:00:00.000Z"
}
```

## Camera Integration

### Get Available Cameras

**GET** `/camera/devices`

Get list of available camera devices.

**Response:**
```json
{
  "cameras": [
    {
      "id": "camera-1",
      "name": "USB Camera",
      "type": "usb",
      "status": "active",
      "resolution": "1920x1080",
      "location": "Main Entrance"
    }
  ]
}
```

### Capture Photo

**POST** `/camera/capture`

Capture a photo from specified camera.

**Request Body:**
```json
{
  "cameraId": "camera-1",
  "employeeId": "uuid",
  "purpose": "clock_in"
}
```

**Response:**
```json
{
  "success": true,
  "photo": {
    "id": "photo-uuid",
    "filename": "capture_20230101_120000.jpg",
    "path": "/uploads/photos/capture_20230101_120000.jpg",
    "employeeId": "uuid",
    "cameraId": "camera-1",
    "purpose": "clock_in",
    "timestamp": "2023-01-01T12:00:00.000Z"
  }
}
```

## Kiosk Interface

### Get Kiosk Configuration

**GET** `/kiosk/config`

Get kiosk-specific configuration.

**Response:**
```json
{
  "config": {
    "timeout": 300,
    "autoRefresh": true,
    "showClock": true,
    "theme": "light",
    "language": "en",
    "features": {
      "rfid": true,
      "camera": true,
      "manual": true
    }
  }
}
```

### RFID Clock In/Out

**POST** `/kiosk/rfid-action`

Process RFID card for clock in/out.

**Request Body:**
```json
{
  "rfidTag": "1234567890",
  "action": "auto",
  "location": "Main Gate"
}
```

**Response:**
```json
{
  "success": true,
  "action": "clock_in",
  "employee": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "employeeNumber": "EMP001"
  },
  "record": {
    "id": "attendance-uuid",
    "clockInTime": "2023-01-01T08:00:00.000Z",
    "location": "Main Gate"
  },
  "message": "Clocked in successfully"
}
```

## Hardware Integration

### Register Hardware Device

**POST** `/hardware/register`

Register a new hardware device.

**Request Body:**
```json
{
  "deviceType": "rfid_reader",
  "deviceId": "RFID001",
  "location": "Main Entrance",
  "configuration": {
    "port": "/dev/ttyUSB0",
    "baudRate": 9600
  }
}
```

**Response:**
```json
{
  "success": true,
  "device": {
    "id": "device-uuid",
    "deviceType": "rfid_reader",
    "deviceId": "RFID001",
    "location": "Main Entrance",
    "status": "active",
    "lastSeen": "2023-01-01T12:00:00.000Z",
    "configuration": {
      "port": "/dev/ttyUSB0",
      "baudRate": 9600
    }
  }
}
```

### Get Hardware Status

**GET** `/hardware/status`

Get status of all registered hardware devices.

**Response:**
```json
{
  "devices": [
    {
      "id": "device-uuid",
      "deviceType": "rfid_reader",
      "deviceId": "RFID001",
      "location": "Main Entrance",
      "status": "active",
      "lastSeen": "2023-01-01T12:00:00.000Z",
      "health": {
        "connectivity": "good",
        "responseTime": 50,
        "errorRate": 0.01
      }
    }
  ]
}
```

## Sync Operations

### Get Sync Status

**GET** `/sync/status`

Get current synchronization status.

**Response:**
```json
{
  "lastSync": "2023-01-01T11:30:00.000Z",
  "nextSync": "2023-01-01T12:00:00.000Z",
  "pendingItems": 5,
  "failedItems": 0,
  "isOnline": true,
  "syncInProgress": false,
  "queueItems": [
    {
      "id": "sync-uuid",
      "operation": "create",
      "entityType": "attendance_record",
      "entityId": "attendance-uuid",
      "attempts": 0,
      "status": "pending",
      "createdAt": "2023-01-01T11:45:00.000Z"
    }
  ]
}
```

### Trigger Manual Sync

**POST** `/sync/trigger`

Manually trigger synchronization process.

**Response:**
```json
{
  "success": true,
  "processed": 5,
  "succeeded": 4,
  "failed": 1,
  "conflicts": 0,
  "duration": 2.5,
  "timestamp": "2023-01-01T12:00:00.000Z"
}
```

### Get Sync Conflicts

**GET** `/sync/conflicts`

Get list of synchronization conflicts.

**Response:**
```json
{
  "conflicts": [
    {
      "id": "conflict-uuid",
      "entityType": "attendance_record",
      "entityId": "attendance-uuid",
      "conflictType": "timestamp_conflict",
      "localData": {
        "clockOutTime": "2023-01-01T17:00:00.000Z"
      },
      "remoteData": {
        "clockOutTime": "2023-01-01T17:15:00.000Z"
      },
      "createdAt": "2023-01-01T17:30:00.000Z"
    }
  ]
}
```

### Resolve Sync Conflict

**POST** `/sync/resolve-conflict`

Resolve a synchronization conflict.

**Request Body:**
```json
{
  "conflictId": "conflict-uuid",
  "resolution": "use_local",
  "reason": "Local data is more accurate"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Conflict resolved successfully",
  "resolution": "use_local",
  "timestamp": "2023-01-01T17:35:00.000Z"
}
```

## Error Handling

### Standard Error Response

All API endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  },
  "timestamp": "2023-01-01T12:00:00.000Z"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `500` - Internal Server Error
- `503` - Service Unavailable

### Common Error Codes

- `INVALID_CREDENTIALS` - Invalid login credentials
- `TOKEN_EXPIRED` - JWT token has expired
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions
- `EMPLOYEE_NOT_FOUND` - Employee ID not found
- `ALREADY_CLOCKED_IN` - Employee is already clocked in
- `NOT_CLOCKED_IN` - Employee is not currently clocked in
- `DUPLICATE_EMPLOYEE_NUMBER` - Employee number already exists
- `INVALID_TIME_CATEGORY` - Time category configuration is invalid
- `SYNC_CONFLICT` - Data synchronization conflict
- `HARDWARE_UNAVAILABLE` - Hardware device is not available
- `DATABASE_ERROR` - Database operation failed

### Rate Limiting

API endpoints are rate-limited to prevent abuse:

- General API: 100 requests per minute per IP
- Login endpoint: 5 requests per minute per IP
- Kiosk endpoints: No rate limiting (for continuous operation)

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1672574400
```

### Pagination

List endpoints support pagination with the following parameters:

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

Pagination information is included in the response:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Filtering and Sorting

Many list endpoints support filtering and sorting:

**Query Parameters:**
- `sortBy` - Field to sort by
- `sortOrder` - `asc` or `desc`
- `search` - Search term
- `filter[field]` - Filter by field value

**Example:**
```
GET /api/admin/employees?sortBy=lastName&sortOrder=asc&search=john&filter[role]=employee
```

---

For more information, please refer to the complete API specification or contact the development team.