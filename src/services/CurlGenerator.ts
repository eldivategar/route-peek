import { Route } from '../models/Route';

export interface CurlOptions {
  baseUrl?: string;
}

export class CurlGenerator {
  public static generate(route: Route, options?: CurlOptions): string {
    const rawBase = options?.baseUrl?.trim() || 'http://localhost:3000';
    const cleanBase = rawBase.replace(/\/+$/, '');

    let cleanPath = route.path || '/';
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    const url = `${cleanBase}${cleanPath}`;
    const method = route.method.toUpperCase();

    return `curl -X ${method} "${url}"`;
  }
}
