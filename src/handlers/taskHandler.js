const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// DynamoDB DocumentClient for easier API
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TASKS_TABLE;

// Validation schemas
const TASK_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled'];

// Helper: build response with CORS headers
const buildResponse = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...headers,
  },
  body: JSON.stringify(body),
});

// Helper: validate task data
const validateTaskData = (data) => {
  const errors = [];
  
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push('Title is required and must be a non-empty string');
  }
  
  if (data.title && data.title.length > 200) {
    errors.push('Title must be less than 200 characters');
  }
  
  if (data.description && typeof data.description !== 'string') {
    errors.push('Description must be a string');
  }
  
  if (data.description && data.description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }
  
  if (data.status && !TASK_STATUSES.includes(data.status)) {
    errors.push(`Status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  
  return errors;
};

// Helper: extract user info from JWT claims
const extractUser = (event) => {
  try {
    const user = event.requestContext?.authorizer?.claims;
    if (!user || !user.sub) {
      console.warn('No valid user found in request context');
      return null;
    }
    return user;
  } catch (error) {
    console.error('Error extracting user info:', error);
    return null;
  }
};

// Helper: log request details
const logRequest = (event, user) => {
  console.log('Request details:', {
    method: event.httpMethod,
    path: event.path,
    user: user?.sub || 'anonymous',
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId,
  });
};

// Lambda handler: routes based on HTTP method
exports.handler = async (event) => {
  const startTime = Date.now();
  
  try {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return buildResponse(200, { message: 'OK' });
    }

    const user = extractUser(event);
    logRequest(event, user);

    // Route to appropriate handler
    switch (event.httpMethod) {
      case 'GET':
        if (event.pathParameters?.id) {
          return await getTask(event.pathParameters.id, user);
        } else {
          return await listTasks(user, event.queryStringParameters);
        }
      case 'POST':
        return await createTask(JSON.parse(event.body || '{}'), user);
      case 'PUT':
        return await updateTask(event.pathParameters.id, JSON.parse(event.body || '{}'), user);
      case 'DELETE':
        return await deleteTask(event.pathParameters.id, user);
      default:
        return buildResponse(405, { 
          message: 'Method Not Allowed',
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Handler error:', {
      error: error.message,
      stack: error.stack,
      duration,
      requestId: event.requestContext?.requestId,
    });
    
    // Don't expose internal errors to client
    return buildResponse(500, { 
      message: 'Internal Server Error',
      requestId: event.requestContext?.requestId,
    });
  }
};

// Create a new task
async function createTask(data, user) {
  console.log('Creating task:', { data, userId: user?.sub });
  
  // Validate input
  const validationErrors = validateTaskData(data);
  if (validationErrors.length > 0) {
    return buildResponse(400, { 
      message: 'Validation failed',
      errors: validationErrors 
    });
  }

  const now = new Date().toISOString();
  const item = {
    id: uuidv4(),
    title: data.title.trim(),
    description: (data.description || '').trim(),
    status: data.status || 'pending',
    createdAt: now,
    updatedAt: now,
    userId: user?.sub || 'anonymous',
  };

  try {
    await dynamoDb.put({ 
      TableName: TABLE_NAME, 
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)' // Prevent duplicate IDs
    }).promise();
    
    console.log('Task created successfully:', item.id);
    return buildResponse(201, item);
  } catch (error) {
    console.error('Error creating task:', error);
    if (error.code === 'ConditionalCheckFailedException') {
      return buildResponse(409, { message: 'Task with this ID already exists' });
    }
    throw error;
  }
}

// Get a single task by id
async function getTask(id, user) {
  console.log('Getting task:', { id, userId: user?.sub });
  
  if (!id || typeof id !== 'string') {
    return buildResponse(400, { message: 'Valid task ID is required' });
  }

  try {
    const result = await dynamoDb.get({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }).promise();
    
    if (!result.Item) {
      return buildResponse(404, { message: 'Task not found' });
    }
    
    // Check ownership if user is authenticated
    if (user && result.Item.userId !== user.sub) {
      return buildResponse(403, { message: 'Access denied' });
    }
    
    return buildResponse(200, result.Item);
  } catch (error) {
    console.error('Error getting task:', error);
    throw error;
  }
}

// List all tasks with optional filtering
async function listTasks(user, queryParams = {}) {
  console.log('Listing tasks:', { userId: user?.sub, queryParams });
  
  try {
    let params = { TableName: TABLE_NAME };
    
    // Filter by user if authenticated
    if (user) {
      params.FilterExpression = 'userId = :uid';
      params.ExpressionAttributeValues = { ':uid': user.sub };
    }
    
    // Add status filter if provided
    if (queryParams?.status && TASK_STATUSES.includes(queryParams.status)) {
      if (params.FilterExpression) {
        params.FilterExpression += ' AND #status = :status';
      } else {
        params.FilterExpression = '#status = :status';
      }
      params.ExpressionAttributeNames = { ...params.ExpressionAttributeNames, '#status': 'status' };
      params.ExpressionAttributeValues = { ...params.ExpressionAttributeValues, ':status': queryParams.status };
    }
    
    // Add pagination
    const limit = parseInt(queryParams?.limit) || 50;
    if (limit > 0 && limit <= 100) {
      params.Limit = limit;
    }
    
    const result = await dynamoDb.scan(params).promise();
    
    // Sort by creation date (newest first)
    const sortedItems = result.Items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    return buildResponse(200, {
      tasks: sortedItems,
      count: sortedItems.length,
      total: result.Count,
    });
  } catch (error) {
    console.error('Error listing tasks:', error);
    throw error;
  }
}

// Update a task
async function updateTask(id, data, user) {
  console.log('Updating task:', { id, data, userId: user?.sub });
  
  if (!id || typeof id !== 'string') {
    return buildResponse(400, { message: 'Valid task ID is required' });
  }
  
  // Validate input
  const validationErrors = validateTaskData(data);
  if (validationErrors.length > 0) {
    return buildResponse(400, { 
      message: 'Validation failed',
      errors: validationErrors 
    });
  }

  try {
    // Get the task first to check ownership
    const getResult = await dynamoDb.get({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }).promise();
    
    if (!getResult.Item) {
      return buildResponse(404, { message: 'Task not found' });
    }
    
    // Check ownership if user is authenticated
    if (user && getResult.Item.userId !== user.sub) {
      return buildResponse(403, { message: 'Access denied' });
    }
    
    const now = new Date().toISOString();
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'set #title = :title, #desc = :desc, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#title': 'title',
        '#desc': 'description',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':title': data.title.trim(),
        ':desc': (data.description || '').trim(),
        ':status': data.status || 'pending',
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    };
    
    const result = await dynamoDb.update(updateParams).promise();
    console.log('Task updated successfully:', id);
    
    return buildResponse(200, result.Attributes);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Delete a task
async function deleteTask(id, user) {
  console.log('Deleting task:', { id, userId: user?.sub });
  
  if (!id || typeof id !== 'string') {
    return buildResponse(400, { message: 'Valid task ID is required' });
  }

  try {
    // Get the task first to check ownership
    const getResult = await dynamoDb.get({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }).promise();
    
    if (!getResult.Item) {
      return buildResponse(404, { message: 'Task not found' });
    }
    
    // Check ownership if user is authenticated
    if (user && getResult.Item.userId !== user.sub) {
      return buildResponse(403, { message: 'Access denied' });
    }
    
    await dynamoDb.delete({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }).promise();
    
    console.log('Task deleted successfully:', id);
    return buildResponse(204, {});
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
} 