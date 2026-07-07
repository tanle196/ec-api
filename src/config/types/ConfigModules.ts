export const ConfigModules = {
  App: 'app',
  Database: 'database',
  Jwt: 'jwt',
  Google: 'google',
  Mail: 'mail',
  Media: 'media',
  Stripe: 'stripe',
} as const;

export type ConfigModulesType =
  (typeof ConfigModules)[keyof typeof ConfigModules];
