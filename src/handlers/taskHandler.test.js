const { handler } = require('./taskHandler');
const AWS = require('aws-sdk');

jest.mock('aws-sdk', () => {
  const mDocumentClient = {
    put: jest.fn().mockReturnThis(),
    promise: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockReturnThis(),
    scan: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => mDocumentClient),
    },
  };
});

describe('taskHandler', () => {
  it('should create a new task', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Test Task', description: 'Test Desc' }),
      requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.title).toBe('Test Task');
    expect(body.userId).toBe('user-123');
  });
}); 