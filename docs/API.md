# Task Manager API Documentation

## Overview

The Task Manager API is a RESTful service built on AWS Lambda, API Gateway, and DynamoDB. It provides full CRUD operations for task management with user authentication via Amazon Cognito.

## Base URL

```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

## Authentication

All API endpoints require authentication using JWT tokens from Amazon Cognito. Include the token in the Authorization header:

```
Authorization: <JWT_TOKEN>
```

## Endpoints

### 1. List Tasks

**GET** `/tasks`

Retrieves all tasks for the authenticated user.

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `status` | string | Filter by task status | All statuses |
| `limit` | integer | Maximum number of tasks to return (1-100) | 50 |

#### Example Request

```bash
curl -X GET "https://api.example.com/prod/tasks?status=completed&limit=10" \
  -H "Authorization: <JWT_TOKEN>"
```

#### Example Response

```json
{
  "tasks": [
    {
      "id": "task-123",
      "title": "Complete project documentation",
      "description": "Write comprehensive documentation for the API",
      "status": "completed",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-16T14:45:00Z",
      "userId": "user-456"
    }
  ],
  "count": 1,
  "total": 1
}
```

### 2. Create Task

**POST** `/tasks`

Creates a new task for the authenticated user.

#### Request Body

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `title` | string | Yes | Task title | 1-200 characters |
| `description` | string | No | Task description | 0-1000 characters |
| `status` | string | No | Task status | One of: pending, in-progress, completed, cancelled |

#### Example Request

```bash
curl -X POST "https://api.example.com/prod/tasks" \
  -H "Authorization: <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement new feature",
    "description": "Add user authentication to the application",
    "status": "pending"
  }'
```

#### Example Response

```json
{
  "id": "task-789",
  "title": "Implement new feature",
  "description": "Add user authentication to the application",
  "status": "pending",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "userId": "user-456"
}
```

### 3. Get Task

**GET** `/tasks/{id}`

Retrieves a specific task by ID.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task ID |

#### Example Request

```bash
curl -X GET "https://api.example.com/prod/tasks/task-123" \
  -H "Authorization: <JWT_TOKEN>"
```

#### Example Response

```json
{
  "id": "task-123",
  "title": "Complete project documentation",
  "description": "Write comprehensive documentation for the API",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-16T14:45:00Z",
  "userId": "user-456"
}
```

### 4. Update Task

**PUT** `/tasks/{id}`

Updates an existing task.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task ID |

#### Request Body

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `title` | string | Yes | Task title | 1-200 characters |
| `description` | string | No | Task description | 0-1000 characters |
| `status` | string | No | Task status | One of: pending, in-progress, completed, cancelled |

#### Example Request

```bash
curl -X PUT "https://api.example.com/prod/tasks/task-123" \
  -H "Authorization: <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated task title",
    "description": "Updated description",
    "status": "in-progress"
  }'
```

#### Example Response

```json
{
  "id": "task-123",
  "title": "Updated task title",
  "description": "Updated description",
  "status": "in-progress",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-16T15:00:00Z",
  "userId": "user-456"
}
```

### 5. Delete Task

**DELETE** `/tasks/{id}`

Deletes a specific task.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task ID |

#### Example Request

```bash
curl -X DELETE "https://api.example.com/prod/tasks/task-123" \
  -H "Authorization: <JWT_TOKEN>"
```

#### Example Response

```json
{}
```

## Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (Delete) |
| 400 | Bad Request (Validation Error) |
| 401 | Unauthorized |
| 403 | Forbidden (Access Denied) |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 409 | Conflict (Duplicate ID) |
| 500 | Internal Server Error |

## Error Responses

### Validation Error (400)

```json
{
  "message": "Validation failed",
  "errors": [
    "Title is required and must be a non-empty string",
    "Status must be one of: pending, in-progress, completed, cancelled"
  ]
}
```

### Not Found (404)

```json
{
  "message": "Task not found"
}
```

### Access Denied (403)

```json
{
  "message": "Access denied"
}
```

### Internal Server Error (500)

```json
{
  "message": "Internal Server Error",
  "requestId": "request-123"
}
```

## Task Status Values

| Status | Description |
|--------|-------------|
| `pending` | Task is waiting to be started |
| `in-progress` | Task is currently being worked on |
| `completed` | Task has been finished |
| `cancelled` | Task has been cancelled |

## Rate Limiting

The API is subject to AWS API Gateway rate limits:
- 10,000 requests per second per region
- 5,000 requests per second per account

## CORS

The API supports CORS for frontend integration:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.example.com/prod',
  headers: {
    'Authorization': '<JWT_TOKEN>',
    'Content-Type': 'application/json'
  }
});

// List tasks
const tasks = await api.get('/tasks');

// Create task
const newTask = await api.post('/tasks', {
  title: 'New Task',
  description: 'Task description',
  status: 'pending'
});

// Update task
const updatedTask = await api.put('/tasks/task-123', {
  title: 'Updated Task',
  status: 'completed'
});

// Delete task
await api.delete('/tasks/task-123');
```

### Python

```python
import requests

headers = {
    'Authorization': '<JWT_TOKEN>',
    'Content-Type': 'application/json'
}

base_url = 'https://api.example.com/prod'

# List tasks
response = requests.get(f'{base_url}/tasks', headers=headers)
tasks = response.json()

# Create task
task_data = {
    'title': 'New Task',
    'description': 'Task description',
    'status': 'pending'
}
response = requests.post(f'{base_url}/tasks', json=task_data, headers=headers)
new_task = response.json()
```

## Testing

You can test the API using the provided frontend interface or tools like Postman. The frontend is available at `frontend/index.html` and provides a user-friendly interface for all API operations.

## Monitoring

The API includes comprehensive logging and monitoring:
- CloudWatch Logs for all Lambda executions
- X-Ray tracing for distributed tracing
- API Gateway access logs
- CloudWatch metrics for performance monitoring 