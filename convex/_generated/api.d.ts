/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as CustomPassword from "../CustomPassword.js";
import type * as SmtpOTP from "../SmtpOTP.js";
import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as eventLocationCategories from "../eventLocationCategories.js";
import type * as eventProducts from "../eventProducts.js";
import type * as eventRoles from "../eventRoles.js";
import type * as eventSeller from "../eventSeller.js";
import type * as eventSellerAggregates from "../eventSellerAggregates.js";
import type * as events from "../events.js";
import type * as featureFlags from "../featureFlags.js";
import type * as http from "../http.js";
import type * as mail from "../mail.js";
import type * as messages from "../messages.js";
import type * as products from "../products.js";
import type * as purchases from "../purchases.js";
import type * as seed from "../seed.js";
import type * as storageCleanup from "../storageCleanup.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  CustomPassword: typeof CustomPassword;
  SmtpOTP: typeof SmtpOTP;
  auth: typeof auth;
  categories: typeof categories;
  constants: typeof constants;
  crons: typeof crons;
  eventLocationCategories: typeof eventLocationCategories;
  eventProducts: typeof eventProducts;
  eventRoles: typeof eventRoles;
  eventSeller: typeof eventSeller;
  eventSellerAggregates: typeof eventSellerAggregates;
  events: typeof events;
  featureFlags: typeof featureFlags;
  http: typeof http;
  mail: typeof mail;
  messages: typeof messages;
  products: typeof products;
  purchases: typeof purchases;
  seed: typeof seed;
  storageCleanup: typeof storageCleanup;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
