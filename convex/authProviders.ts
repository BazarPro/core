import { query } from './_generated/server';

/** OAuth providers with credentials on this deployment; the login page only offers these. */
export const configured = query({
  args: {},
  handler: async () => ({
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  }),
});
