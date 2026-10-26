import { DocumentBuilder, type SwaggerCustomOptions } from '@nestjs/swagger';

// Security scheme names referenced by @ApiBearerAuth(...) on controllers.
// They must match the names registered below, otherwise Swagger UI never
// attaches the token to the request.
export const ACCESS_TOKEN_AUTH = 'access-token';
export const REFRESH_TOKEN_AUTH = 'refresh-token';

export const buildSwaggerConfig = () =>
  new DocumentBuilder()
    .setTitle('EC API')
    .setDescription('E-Commerce REST API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token from /auth/login or /admin/auth/login',
      },
      ACCESS_TOKEN_AUTH,
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Refresh token — only used by the /refresh endpoints',
      },
      REFRESH_TOKEN_AUTH,
    )
    .build();

interface SwaggerUiResponse {
  url: string;
  ok: boolean;
  body?: unknown;
}

/**
 * Swagger UI response interceptor: after a successful login/refresh call made
 * from the docs page, authorize both schemes with the returned tokens so the
 * next "Try it out" requests carry them automatically.
 *
 * Runs in the browser — @nestjs/swagger inlines it via `toString()`, so it
 * must not reference anything outside its own body (scheme names are
 * literals on purpose).
 */
export function authorizeFromTokenResponse(
  res: SwaggerUiResponse,
): SwaggerUiResponse {
  if (!res.ok || !/\/auth\/(login|refresh)(\?|$)/.test(res.url)) return res;

  const ui = (
    globalThis as {
      ui?: {
        preauthorizeApiKey(name: string, value: string): void;
        authActions?: { persistAuthorizationIfNeeded?(): void };
      };
    }
  ).ui;
  const body = res.body as
    | { accessToken?: unknown; refreshToken?: unknown }
    | undefined;
  if (!ui || !body) return res;

  if (typeof body.accessToken === 'string') {
    ui.preauthorizeApiKey('access-token', body.accessToken);
  }
  if (typeof body.refreshToken === 'string') {
    ui.preauthorizeApiKey('refresh-token', body.refreshToken);
  }
  // preauthorizeApiKey bypasses persistAuthorization, so without this the
  // tokens are lost on reload and are not shared between /docs and /docs/admin.
  ui.authActions?.persistAuthorizationIfNeeded?.();
  return res;
}

export const swaggerUiOptions: SwaggerCustomOptions = {
  swaggerOptions: {
    // Keep the entered tokens across page reloads.
    persistAuthorization: true,
    responseInterceptor: authorizeFromTokenResponse,
  },
};
