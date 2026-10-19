import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { ONE_CLICK_UNSUBSCRIBE_PATH } from './notifications';

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe
 * header. Only POST, so link scanners following the URL do not unsubscribe anyone.
 */
http.route({
  path: ONE_CLICK_UNSUBSCRIBE_PATH,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const done = await ctx.runMutation(internal.notifications.unsubscribeOneClick, {
      token: params.get('t') ?? '',
      category: params.get('k') ?? '',
    });
    return new Response(done ? 'Abbestellt' : 'Ungültiger Abmeldelink', {
      status: done ? 200 : 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }),
});

export default http;
