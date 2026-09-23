import { PostHog } from "posthog-node/edge";

let posthog;

export function getPostHog(env) {
  const apiKey = env.POSTHOG_API_KEY;
  const host = env.POSTHOG_HOST;

  if (!apiKey || !host) {
    if (env.ENVIRONMENT === "development") {
      const variable = !apiKey ? "POSTHOG_API_KEY" : "POSTHOG_HOST";
      console.error(
        `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`
      );
    }
    return null;
  }

  if (!posthog) {
    posthog = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    });
  }

  return posthog;
}
