export const PUBLIC_APP_URL = 'https://family-location.lovable.app';

function getRuntimePublicAppUrl() {
  if (typeof window === 'undefined') {
    return PUBLIC_APP_URL;
  }

  const { origin, hostname } = window.location;
  const isPreviewHost =
    hostname.includes('lovableproject.com') ||
    hostname.startsWith('id-preview--');

  return isPreviewHost ? PUBLIC_APP_URL : origin;
}

export function getPublicAppUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, getRuntimePublicAppUrl()).toString();
}