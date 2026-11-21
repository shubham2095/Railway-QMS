import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context: the signed-in user, IP and user agent (used by the audit log). */
export const requestContext = new AsyncLocalStorage();

export const currentContext = () => requestContext.getStore() ?? {};
export const currentUserId = () => currentContext().user?.id ?? null;
