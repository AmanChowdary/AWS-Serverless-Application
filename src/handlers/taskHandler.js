const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// DynamoDB DocumentClient for easier API
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TASKS_TABLE;

// Helper: build response
const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Lambda handler: routes based on HTTP method
exports.handler = async (event) => {
  try {
    // Extract user info from Cognito JWT claims (if present)
    const user = event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.claims
      ? event.requestContext.authorizer.claims
      : null;
    // Optionally, use user.sub (Cognito user ID) for user-level data partitioning
    switch (event.httpMethod) {
      case 'GET':
        if (event.pathParameters && event.pathParameters.id) {
          return await getTask(event.pathParameters.id, user);
        } else {
          return await listTasks(user);
        }
      case 'POST':
        return await createTask(JSON.parse(event.body), user);
      case 'PUT':
        return await updateTask(event.pathParameters.id, JSON.parse(event.body), user);
      case 'DELETE':
        return await deleteTask(event.pathParameters.id, user);
      default:
        return buildResponse(405, { message: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error('Error:', err);
    return buildResponse(500, { message: 'Internal Server Error', error: err.message });
  }
};

// Create a new task
async function createTask(data, user) {
  const now = new Date().toISOString();
  const item = {
    id: uuidv4(),
    title: data.title,
    description: data.description || '',
    status: data.status || 'pending',
    createdAt: now,
    updatedAt: now,
    userId: user ? user.sub : 'anonymous', // Partition by user
  };
  await dynamoDb.put({ TableName: TABLE_NAME, Item: item }).promise();
  return buildResponse(201, item);
}

// Get a single task by id
async function getTask(id, user) {
  const result = await dynamoDb.get({ TableName: TABLE_NAME, Key: { id } }).promise();
  if (!result.Item || (user && result.Item.userId !== user.sub)) {
    return buildResponse(404, { message: 'Task not found' });
  }
  return buildResponse(200, result.Item);
}

// List all tasks
async function listTasks(user) {
  // Only list tasks for the authenticated user
  const params = user
    ? { TableName: TABLE_NAME, FilterExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': user.sub } }
    : { TableName: TABLE_NAME };
  const result = await dynamoDb.scan(params).promise();
  return buildResponse(200, result.Items);
}

// Update a task
async function updateTask(id, data, user) {
  // Get the task first to check ownership
  const getResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { id } }).promise();
  if (!getResult.Item || (user && getResult.Item.userId !== user.sub)) {
    return buildResponse(404, { message: 'Task not found' });
  }
  const now = new Date().toISOString();
  const params = {
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
      ':title': data.title,
      ':desc': data.description || '',
      ':status': data.status || 'pending',
      ':updatedAt': now,
    },
    ReturnValues: 'ALL_NEW',
  };
  const result = await dynamoDb.update(params).promise();
  return buildResponse(200, result.Attributes);
}

// Delete a task
async function deleteTask(id, user) {
  // Get the task first to check ownership
  const getResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { id } }).promise();
  if (!getResult.Item || (user && getResult.Item.userId !== user.sub)) {
    return buildResponse(404, { message: 'Task not found' });
  }
  await dynamoDb.delete({ TableName: TABLE_NAME, Key: { id } }).promise();
  return buildResponse(204, {});
} 