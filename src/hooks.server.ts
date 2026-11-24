import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;
  if (pathname.includes('//')) {
    const normalized = pathname.replace(/\/{2,}/g, '/');
    throw redirect(307, `${normalized}${search}`);
  }
  return resolve(event);
};
