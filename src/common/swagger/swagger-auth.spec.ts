import { JwtRefreshGuard } from '@/auth/guards/jwt-auth-refresh.guard';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  CONTROLLER_WATERMARK,
  GUARDS_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import * as fs from 'fs';
import * as path from 'path';
import {
  ACCESS_TOKEN_AUTH,
  REFRESH_TOKEN_AUTH,
  authorizeFromTokenResponse,
  buildSwaggerConfig,
} from './swagger.config';

type Ctor = abstract new (...args: never[]) => unknown;

const findControllerFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findControllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });

// Loaded dynamically so controllers added later are covered automatically.
const controllers = findControllerFiles(path.resolve(__dirname, '../..'))
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  .flatMap((file) => Object.values(require(file) as Record<string, unknown>))
  .filter(
    (exp): exp is Ctor =>
      typeof exp === 'function' &&
      Reflect.getMetadata(CONTROLLER_WATERMARK, exp) === true,
  );

// Every route handler with the guards and Swagger security schemes that apply
// to it, merging class-level and method-level decorators.
const routes = controllers.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype)
    .map((name) => ({
      name,
      handler: Object.getOwnPropertyDescriptor(controller.prototype, name)
        ?.value as object,
    }))
    .filter(
      ({ handler }) =>
        typeof handler === 'function' &&
        Reflect.getMetadata(METHOD_METADATA, handler) !== undefined,
    )
    .map(({ name, handler }) => {
      const metadata = <T>(key: string) => [
        ...((Reflect.getMetadata(key, controller) as T[] | undefined) ?? []),
        ...((Reflect.getMetadata(key, handler) as T[] | undefined) ?? []),
      ];
      return {
        route: `${controller.name}.${name}`,
        guards: metadata<unknown>(GUARDS_METADATA),
        schemes: metadata<Record<string, unknown>>(
          DECORATORS.API_SECURITY,
        ).flatMap((s) => Object.keys(s)),
      };
    }),
);

describe('Swagger bearer auth', () => {
  it('discovers the application controllers', () => {
    expect(controllers.length).toBeGreaterThan(20);
  });

  it('registers both bearer schemes in the document config', () => {
    expect(
      Object.keys(buildSwaggerConfig().components?.securitySchemes ?? {}),
    ).toEqual([ACCESS_TOKEN_AUTH, REFRESH_TOKEN_AUTH]);
  });

  it('every JwtAuthGuard route documents the access-token scheme', () => {
    const missing = routes
      .filter((r) => r.guards.includes(JwtAuthGuard))
      .filter((r) => !r.schemes.includes(ACCESS_TOKEN_AUTH))
      .map((r) => r.route);

    expect(missing).toEqual([]);
  });

  it('every JwtRefreshGuard route documents the refresh-token scheme', () => {
    const missing = routes
      .filter((r) => r.guards.includes(JwtRefreshGuard))
      .filter((r) => !r.schemes.includes(REFRESH_TOKEN_AUTH))
      .map((r) => r.route);

    expect(missing).toEqual([]);
  });

  it('only references registered scheme names', () => {
    const unknown = routes.flatMap((r) =>
      r.schemes
        .filter((s) => s !== ACCESS_TOKEN_AUTH && s !== REFRESH_TOKEN_AUTH)
        .map((s) => `${r.route}: ${s}`),
    );

    expect(unknown).toEqual([]);
  });
});

describe('authorizeFromTokenResponse', () => {
  const preauthorizeApiKey = jest.fn();
  const persistAuthorizationIfNeeded = jest.fn();
  const tokens = { accessToken: 'access', refreshToken: 'refresh' };

  beforeEach(() => {
    preauthorizeApiKey.mockClear();
    persistAuthorizationIfNeeded.mockClear();
    (globalThis as { ui?: unknown }).ui = {
      preauthorizeApiKey,
      authActions: { persistAuthorizationIfNeeded },
    };
  });

  afterAll(() => {
    delete (globalThis as { ui?: unknown }).ui;
  });

  it.each([
    'http://localhost:3000/auth/login',
    'http://localhost:3000/auth/refresh',
    'http://localhost:3000/admin/auth/login',
    'http://localhost:3000/admin/auth/refresh',
  ])('authorizes both schemes after %s', (url) => {
    const res = { url, ok: true, body: tokens };

    expect(authorizeFromTokenResponse(res)).toBe(res);
    expect(preauthorizeApiKey).toHaveBeenCalledWith(
      ACCESS_TOKEN_AUTH,
      'access',
    );
    expect(preauthorizeApiKey).toHaveBeenCalledWith(
      REFRESH_TOKEN_AUTH,
      'refresh',
    );
    // Without persisting, the tokens vanish on reload / between doc pages.
    expect(persistAuthorizationIfNeeded).toHaveBeenCalled();
  });

  it('ignores failed logins', () => {
    authorizeFromTokenResponse({
      url: 'http://localhost:3000/auth/login',
      ok: false,
      body: tokens,
    });

    expect(preauthorizeApiKey).not.toHaveBeenCalled();
  });

  it('ignores other endpoints even if they return token-like fields', () => {
    authorizeFromTokenResponse({
      url: 'http://localhost:3000/auth/reset-password',
      ok: true,
      body: tokens,
    });

    expect(preauthorizeApiKey).not.toHaveBeenCalled();
  });
});
