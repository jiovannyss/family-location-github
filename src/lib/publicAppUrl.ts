export const PUBLIC_APP_URL = 'https://family-location.glowter.com';

export function getPublicAppUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, PUBLIC_APP_URL).toString();
}