import { TemplateEngine, TemplateContext } from '../src/core/template';

describe('TemplateEngine', () => {
  const testContext: TemplateContext = {
    params: {
      id: '123',
      name: 'test-user',
    },
    query: {
      page: '1',
      limit: '10',
      search: 'query',
    },
    body: {
      title: 'Test Post',
      content: 'Content',
    },
  };

  describe('render', () => {
    it('should render string values without templates', () => {
      const result = TemplateEngine.render('static string', testContext);
      expect(result).toBe('static string');
    });

    it('should render null values', () => {
      const result = TemplateEngine.render(null, testContext);
      expect(result).toBeNull();
    });

    it('should render number values', () => {
      const result = TemplateEngine.render(42, testContext);
      expect(result).toBe(42);
    });

    it('should render boolean values', () => {
      const result = TemplateEngine.render(true, testContext);
      expect(result).toBe(true);
    });
  });

  describe('params variables', () => {
    it('should render params variables', () => {
      const result = TemplateEngine.render('User ID: {{params.id}}', testContext);
      expect(result).toBe('User ID: 123');
    });

    it('should render multiple params variables', () => {
      const result = TemplateEngine.render('{{params.id}} - {{params.name}}', testContext);
      expect(result).toBe('123 - test-user');
    });

    it('should return empty string for non-existent params', () => {
      const result = TemplateEngine.render('{{params.nonExistent}}', testContext);
      expect(result).toBe('');
    });
  });

  describe('query variables', () => {
    it('should render query variables', () => {
      const result = TemplateEngine.render('Page: {{query.page}}', testContext);
      expect(result).toBe('Page: 1');
    });

    it('should render multiple query variables', () => {
      const result = TemplateEngine.render('{{query.page}} / {{query.limit}}', testContext);
      expect(result).toBe('1 / 10');
    });

    it('should return empty string for non-existent query', () => {
      const result = TemplateEngine.render('{{query.nonExistent}}', testContext);
      expect(result).toBe('');
    });
  });

  describe('built-in functions', () => {
    it('should render timestamp', () => {
      const result = TemplateEngine.render('{{timestamp}}', testContext);
      const timestamp = parseInt(result, 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should render UUID in correct format', () => {
      const result = TemplateEngine.render('{{uuid}}', testContext);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const result1 = TemplateEngine.render('{{uuid}}', testContext);
      const result2 = TemplateEngine.render('{{uuid}}', testContext);
      expect(result1).not.toBe(result2);
    });

    it('should render random number', () => {
      const result = TemplateEngine.render('{{random}}', testContext);
      const random = parseFloat(result);
      expect(random).toBeGreaterThanOrEqual(0);
      expect(random).toBeLessThan(1);
    });
  });

  describe('nested objects and arrays', () => {
    it('should render nested object templates', () => {
      const obj = {
        message: 'User {{params.id}}',
        details: {
          name: '{{params.name}}',
          page: '{{query.page}}',
        },
      };

      const result = TemplateEngine.render(obj, testContext);
      expect(result).toEqual({
        message: 'User 123',
        details: {
          name: 'test-user',
          page: '1',
        },
      });
    });

    it('should render array templates', () => {
      const arr = [
        'User {{params.id}}',
        'Page {{query.page}}',
        { nested: '{{params.name}}' },
      ];

      const result = TemplateEngine.render(arr, testContext);
      expect(result).toEqual([
        'User 123',
        'Page 1',
        { nested: 'test-user' },
      ]);
    });

    it('should render complex nested structures', () => {
      const complex = {
        users: [
          { id: '{{params.id}}', name: '{{params.name}}' },
          { id: '2', name: 'user2' },
        ],
        pagination: {
          page: '{{query.page}}',
          limit: '{{query.limit}}',
        },
        timestamp: '{{timestamp}}',
      };

      const result = TemplateEngine.render(complex, testContext);
      expect(result.users).toEqual([
        { id: '123', name: 'test-user' },
        { id: '2', name: 'user2' },
      ]);
      expect(result.pagination).toEqual({
        page: '1',
        limit: '10',
      });
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in template expressions', () => {
      const result = TemplateEngine.render('{{ params.id }}', testContext);
      expect(result).toBe('123');
    });

    it('should handle multiple templates in same string', () => {
      const result = TemplateEngine.render(
        'ID: {{params.id}}, Page: {{query.page}}, Name: {{params.name}}',
        testContext
      );
      expect(result).toBe('ID: 123, Page: 1, Name: test-user');
    });

    it('should leave unknown expressions unchanged', () => {
      const result = TemplateEngine.render('{{unknown.var}}', testContext);
      expect(result).toBe('unknown.var');
    });

    it('should handle empty template context', () => {
      const emptyContext: TemplateContext = {
        params: {},
        query: {},
        body: {},
      };

      const result = TemplateEngine.render('{{params.id}}', emptyContext);
      expect(result).toBe('');
    });

    it('should handle nested template in params values', () => {
      const result = TemplateEngine.render(
        'Value: {{params.id}}',
        {
          params: { id: '{{nested}}' },
          query: {},
          body: {},
        }
      );
      expect(result).toBe('Value: {{nested}}');
    });
  });
});
