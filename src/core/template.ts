export interface TemplateContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
}

export class TemplateEngine {
  static render(value: any, context: TemplateContext): any {
    if (typeof value === 'string') {
      return this.renderString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.render(item, context));
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.render(val, context);
      }
      return result;
    }

    return value;
  }

  private static renderString(str: string, context: TemplateContext): string {
    const templateRegex = /\{\{([^}]+)\}\}/g;

    return str.replace(templateRegex, (match, expression) => {
      const trimmedExpression = expression.trim();

      try {
        return this.evaluateExpression(trimmedExpression, context);
      } catch (error) {
        console.warn(`模板表达式求值失败: ${trimmedExpression}`, error);
        return match;
      }
    });
  }

  private static evaluateExpression(expression: string, context: TemplateContext): string {
    if (expression.startsWith('params.')) {
      const key = expression.slice(7);
      return String(context.params[key] ?? '');
    }

    if (expression.startsWith('query.')) {
      const key = expression.slice(6);
      return String(context.query[key] ?? '');
    }

    if (expression === 'timestamp') {
      return String(Date.now());
    }

    if (expression === 'uuid') {
      return this.generateUUID();
    }

    if (expression === 'random') {
      return String(Math.random());
    }

    const jsonMatch = expression.match(/^json\((.*)\)$/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1];
      try {
        return JSON.parse(jsonStr);
      } catch {
        return jsonStr;
      }
    }

    return expression;
  }

  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
