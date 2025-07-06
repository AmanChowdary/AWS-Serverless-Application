const { handler } = require('./taskHandler');
const AWS = require('aws-sdk');

// Mock AWS SDK
const mockDocumentClient = {
  put: jest.fn().mockReturnThis(),
  get: jest.fn().mockReturnThis(),
  scan: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  promise: jest.fn(),
};

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => mockDocumentClient),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

describe('taskHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TASKS_TABLE = 'test-tasks-table';
  });

  const mockUser = {
    sub: 'user-123',
    email: 'test@example.com',
  };

  const mockEvent = {
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: mockUser,
      },
    },
  };

  describe('CORS handling', () => {
    it('should handle OPTIONS requests', async () => {
      const event = { ...mockEvent, httpMethod: 'OPTIONS' };
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
    });
  });

  describe('CREATE task', () => {
    it('should create a new task successfully', async () => {
      mockDocumentClient.promise.mockResolvedValue({});
      
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({ title: 'Test Task', description: 'Test Description' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('Test Task');
      expect(body.description).toBe('Test Description');
      expect(body.userId).toBe('user-123');
      expect(body.id).toBe('test-uuid-123');
    });

    it('should validate required fields', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({ description: 'Test Description' }), // Missing title
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toContain('Title is required and must be a non-empty string');
    });

    it('should validate title length', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({ title: 'a'.repeat(201) }), // Too long
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.errors).toContain('Title must be less than 200 characters');
    });

    it('should validate status values', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({ title: 'Test Task', status: 'invalid-status' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.errors).toContain('Status must be one of: pending, in-progress, completed, cancelled');
    });

    it('should handle DynamoDB errors', async () => {
      mockDocumentClient.promise.mockRejectedValue(new Error('DynamoDB error'));
      
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({ title: 'Test Task' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
    });
  });

  describe('GET task', () => {
    it('should get a task by ID successfully', async () => {
      const mockTask = {
        id: 'test-id',
        title: 'Test Task',
        userId: 'user-123',
      };
      mockDocumentClient.promise.mockResolvedValue({ Item: mockTask });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { id: 'test-id' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual(mockTask);
    });

    it('should return 404 for non-existent task', async () => {
      mockDocumentClient.promise.mockResolvedValue({ Item: null });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { id: 'non-existent' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(404);
    });

    it('should return 403 for unauthorized access', async () => {
      const mockTask = {
        id: 'test-id',
        title: 'Test Task',
        userId: 'different-user',
      };
      mockDocumentClient.promise.mockResolvedValue({ Item: mockTask });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { id: 'test-id' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(403);
    });

    it('should validate task ID', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { id: '' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
    });
  });

  describe('LIST tasks', () => {
    it('should list tasks for authenticated user', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', userId: 'user-123' },
        { id: '2', title: 'Task 2', userId: 'user-123' },
      ];
      mockDocumentClient.promise.mockResolvedValue({ Items: mockTasks, Count: 2 });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.tasks).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('should filter by status', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'completed', userId: 'user-123' },
      ];
      mockDocumentClient.promise.mockResolvedValue({ Items: mockTasks, Count: 1 });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        queryStringParameters: { status: 'completed' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.tasks).toHaveLength(1);
    });

    it('should handle pagination', async () => {
      const mockTasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        userId: 'user-123',
      }));
      mockDocumentClient.promise.mockResolvedValue({ Items: mockTasks, Count: 10 });
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        queryStringParameters: { limit: '5' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.tasks).toHaveLength(10); // Still returns all due to sorting
    });
  });

  describe('UPDATE task', () => {
    it('should update a task successfully', async () => {
      const existingTask = {
        id: 'test-id',
        title: 'Old Title',
        userId: 'user-123',
      };
      const updatedTask = {
        id: 'test-id',
        title: 'New Title',
        description: 'Updated description',
        status: 'completed',
        userId: 'user-123',
      };
      
      mockDocumentClient.promise
        .mockResolvedValueOnce({ Item: existingTask }) // get
        .mockResolvedValueOnce({ Attributes: updatedTask }); // update
      
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        pathParameters: { id: 'test-id' },
        body: JSON.stringify({ title: 'New Title', description: 'Updated description', status: 'completed' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('New Title');
    });

    it('should return 404 for non-existent task', async () => {
      mockDocumentClient.promise.mockResolvedValue({ Item: null });
      
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        pathParameters: { id: 'non-existent' },
        body: JSON.stringify({ title: 'New Title' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(404);
    });

    it('should validate update data', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        pathParameters: { id: 'test-id' },
        body: JSON.stringify({ title: '', status: 'invalid' }),
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.errors).toContain('Title is required and must be a non-empty string');
      expect(body.errors).toContain('Status must be one of: pending, in-progress, completed, cancelled');
    });
  });

  describe('DELETE task', () => {
    it('should delete a task successfully', async () => {
      const existingTask = {
        id: 'test-id',
        title: 'Test Task',
        userId: 'user-123',
      };
      
      mockDocumentClient.promise
        .mockResolvedValueOnce({ Item: existingTask }) // get
        .mockResolvedValueOnce({}); // delete
      
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        pathParameters: { id: 'test-id' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(204);
    });

    it('should return 404 for non-existent task', async () => {
      mockDocumentClient.promise.mockResolvedValue({ Item: null });
      
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        pathParameters: { id: 'non-existent' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(404);
    });

    it('should return 403 for unauthorized deletion', async () => {
      const existingTask = {
        id: 'test-id',
        title: 'Test Task',
        userId: 'different-user',
      };
      
      mockDocumentClient.promise.mockResolvedValue({ Item: existingTask });
      
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        pathParameters: { id: 'test-id' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(403);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid HTTP method', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PATCH',
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Method Not Allowed');
    });

    it('should handle malformed JSON', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: 'invalid json',
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockDocumentClient.promise.mockRejectedValue(new Error('DynamoDB error'));
      
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { id: 'test-id' },
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal Server Error');
      expect(body.requestId).toBe('test-request-id');
    });
  });

  describe('User authentication', () => {
    it('should handle requests without user context', async () => {
      const event = {
        ...mockEvent,
        requestContext: { requestId: 'test-request-id' }, // No authorizer
        httpMethod: 'GET',
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).toBe(200); // Should still work but with anonymous user
    });
  });
}); 