/**
 * Replaces `{key}` placeholders in a translated string.
 * Example: formatMessage("{count} haber", { count: 12 }) -> "12 haber"
 */
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
