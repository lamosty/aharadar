/**
 * Type-safe i18n helper for the web application.
 *
 * Usage:
 *   import { t } from '@/lib/i18n';
 *   t('nav.home') // => 'Home'
 *   t('login.checkEmailDescription', { email: 'user@example.com' }) // => 'We sent a login link to user@example.com'
 */

import messages from "../messages/en.json";

type Messages = typeof messages;

/**
 * Recursively build dot-notation paths for the messages object.
 * e.g., 'common.appName' | 'nav.home' | etc.
 */
type PathsToStringProps<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T]: K extends string
        ? PathsToStringProps<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
        : never;
    }[keyof T];

export type MessageKey = PathsToStringProps<Messages>;

type InterpolationParams = Record<string, string | number>;

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate variables in a message string.
 * Replaces {variable} with the corresponding value from params.
 */
function interpolate(message: string, params?: InterpolationParams): string {
  if (!params) return message;

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Type-safe translation function.
 *
 * @param key - Dot-notation path to the message (e.g., 'nav.home')
 * @param params - Optional interpolation parameters
 * @returns The translated message, or the key if not found
 */
export function t(key: MessageKey, params?: InterpolationParams): string {
  const message = getNestedValue(messages as Record<string, unknown>, key);

  if (message === undefined) {
    console.warn(`Missing translation for key: ${key}`);
    return key;
  }

  return interpolate(message, params);
}

/**
 * Get all messages for a namespace.
 * Useful for passing to components that need multiple messages.
 */
export function getMessages<K extends keyof Messages>(namespace: K): Messages[K] {
  return messages[namespace];
}

export { messages };
