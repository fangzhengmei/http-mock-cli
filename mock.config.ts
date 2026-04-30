import { MockConfig } from './src/types';

const config: MockConfig = {
  port: 3000,
  routes: [
    {
      method: 'GET',
      path: '/api/users',
      description: '获取用户列表',
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          users: [
            { id: 1, name: 'Alice', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' },
            { id: 3, name: 'Charlie', email: 'charlie@example.com' },
          ],
          pagination: {
            page: '{{query.page}}',
            limit: '{{query.limit}}',
          },
        },
      },
    },
    {
      method: 'GET',
      path: '/api/users/:id',
      description: '获取单个用户',
      response: {
        status: 200,
        body: {
          id: '{{params.id}}',
          name: 'User {{params.id}}',
          email: 'user{{params.id}}@example.com',
          createdAt: '{{timestamp}}',
        },
      },
    },
    {
      method: 'POST',
      path: '/api/users',
      description: '创建用户',
      response: (params, query, body) => ({
        status: 201,
        headers: {
          'Location': `/api/users/1`,
        },
        body: {
          id: Date.now(),
          ...body,
          createdAt: new Date().toISOString(),
        },
      }),
    },
    {
      method: 'PUT',
      path: '/api/users/:id',
      description: '更新用户',
      response: {
        status: 200,
        body: {
          id: '{{params.id}}',
          name: '{{body.name}}',
          email: '{{body.email}}',
          updatedAt: '{{timestamp}}',
        },
      },
    },
    {
      method: 'DELETE',
      path: '/api/users/:id',
      description: '删除用户',
      response: {
        status: 204,
      },
    },
    {
      method: 'GET',
      path: '/api/search',
      description: '搜索用户',
      response: {
        status: 200,
        body: {
          query: '{{query.q}}',
          results: [
            { id: 1, name: 'Result 1' },
            { id: 2, name: 'Result 2' },
          ],
        },
      },
    },
    {
      method: 'GET',
      path: '/api/delay',
      description: '延迟响应示例',
      response: {
        status: 200,
        body: {
          message: 'This response was delayed by 1 second',
          timestamp: '{{timestamp}}',
        },
        delay: 1000,
      },
    },
    {
      method: 'GET',
      path: '/api/uuid',
      description: '生成 UUID 示例',
      response: {
        status: 200,
        body: {
          uuid: '{{uuid}}',
        },
      },
    },
    {
      method: 'GET',
      path: '/api/random',
      description: '生成随机数示例',
      response: {
        status: 200,
        body: {
          random: '{{random}}',
          timestamp: '{{timestamp}}',
        },
      },
    },
  ],
  defaultResponse: {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'Not Found',
      message: 'The requested resource was not found',
      documentation: 'Please check the API documentation for valid endpoints',
    },
  },
};

export default config;
