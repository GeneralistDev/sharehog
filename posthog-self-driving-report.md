# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for ShareHog with Session Replay, Error Tracking, and Support enabled, plus health, error, and support signal sources. Two Replay Vision monitors and a focused scout troop are active; findings should begin appearing in the [Self-driving inbox](https://eu.posthog.com/project/173637/inbox) within about 30 minutes.

## AI data processing

Approved by the wizard's organization-level gate.

## GitHub

GitHub was already connected before this setup.

## Products enabled

| Product | Result | Notes |
| --- | --- | --- |
| Session Replay | already enabled | The browser initialization does not disable recording. Recordings are already arriving from the web app. |
| Error Tracking | enabled | The browser initialization enables exception capture and the server SDK enables exception autocapture. |
| Support | enabled | Tickets will arrive only after an inbound email, inbox, or Slack channel is connected in PostHog. |

## Signal sources

| Signal source | Action | Notes |
| --- | --- | --- |
| `health_checks` / `health_issue` | enabled | Configuration id `01a0cda6-77f5-7ecd-baf9-23506f3756ef`. |
| `error_tracking` / `issue_created` | enabled | Configuration id `01a0cda6-7830-7e31-a870-7f04db3d793b`. |
| `error_tracking` / `issue_reopened` | enabled | Configuration id `01a0cda6-784a-768f-a34d-be7736b8032d`. |
| `error_tracking` / `issue_spiking` | enabled | Configuration id `01a0cda6-7921-7ba1-a83d-aa9b76951371`. |
| `conversations` / `ticket` | enabled | Configuration id `01a0cda6-7969-7ab8-a6aa-53d4a24571ef`; idle until Support has an inbound channel. |
| `signals_scout` / `cross_source_issue` | skipped | Enabled by default because no opt-out row exists. |
| Session replay native source | skipped | Retired route; Replay Vision scanners provide the replay route into Self-driving. |
| `replay_vision` source config | skipped | Scanners self-authorize with `emits_signals: true`; no source row is required. |

## Connected tools

No connected-tool responders were selected. GitHub remains connected as an integration, but GitHub Issues was not selected for Self-driving.

## Scout troop

**Active scouts (3):**

| Scout | What it watches |
| --- | --- |
| General | Cross-product correlations and surfaces without a specialist. |
| Web analytics | Traffic volume, attribution, and landing-page health. |
| Product analytics | Product-flow conversion, retention, lifecycle, and path regressions. |

**Disabled scouts (24):**

| Scout | Reason |
| --- | --- |
| AI observability | No LLM/AI observability evidence. |
| Anomaly detection | No established saved insights or dashboards to monitor. |
| APM | No distributed tracing evidence. |
| Conversations | Support has no connected inbound channel yet. |
| CSP violations | No CSP-reporting evidence. |
| Customer analytics | No account/group analytics evidence. |
| Data pipelines | No CDP, batch export, or Hog flow evidence. |
| Data warehouse | No warehouse sources selected. |
| Error tracking | Covered by the native Error Tracking signal sources. |
| Experiments | No active experiment evidence. |
| Feature flags | No feature-flag evidence. |
| Inbox validation | Fresh setup has no resolved reports to validate. |
| Insight alerts | No configured insight-alert evidence. |
| Logs | No PostHog Logs evidence. |
| MCP tool calls | No MCP telemetry surface identified for this product. |
| Observability gaps | Not selected over the directly-used web and product analytics surfaces. |
| PR follow-up | No Self-driving PR history yet. |
| Replay Vision | No prior scanner observation history; new scanners are the replay route. |
| Revenue analytics | No payment or revenue data evidence. |
| Session replay | Covered by the Replay Vision scanners. |
| Skills store | No project skill-store surface to monitor. |
| Surveys | No surveys exist. |
| Tasks | No PostHog Tasks evidence. |
| Web vitals | No Core Web Vitals usage evidence. |

The verified Scout run budget is **100 runs per day**; **0** were used and **100** remained when configured. Early-access banner: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

## Custom scouts

No custom scouts were created. Two candidates were proposed and declined:

- **Sharing activation journey:** would have watched account creation through first listing publication, speaking up only when publishing fell while account creation held steady. It overlaps the active Product analytics scout, but adds a domain-specific acquisition-vs-friction discriminator.
- **Listing completeness:** would have watched sustained drops in title, image, and description completion on newly published listings. It partially overlaps product analytics but targets marketplace-content quality rather than flow conversion.

Error bursts and replay breakage were ruled out as custom-scout surfaces because they already have dedicated native/Error Tracking and Replay Vision routes. Other product surfaces were ruled out because the repository and available project profile provided no evidence that they are in use. If a future custom scout is noisy, set its config's `emit` value to `false` in PostHog to make it dry-run only.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes qualified findings to the inbox. These are the only objects in this setup that spend Replay Vision quota; each finding has half weight and needs corroboration before it is promoted into a report.

| Brief | Status | Scanner | Query scope | Sampling | Sizing estimate |
| --- | --- | --- | --- | --- | --- |
| Breakage monitor | created | ShareHog listing publishing breakage | Recordings visiting the `/new` listing-publication route, the core publishing completion flow. | 50% | 30 observations/month; 150 credits/month (5 credits each). |
| Frustration monitor | created | ShareHog listing user frustration | Sessions containing `$rageclick`, with no URL filter. | 100% | 0 observations/month; 0 credits/month at the time of sizing. |

The organization had 2,500 credits remaining and was not exhausted when these low-cost monitors were created. Session Replay recordings already exist, so both scanners are armed immediately.

## Files modified or created

| File | Change |
| --- | --- |
| `posthog-self-driving-report.md` | Created this setup report. |

No application source files were changed.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so the enabled Support responder can receive tickets.
- [ ] After the monitors accumulate observations, review and rate their results in Replay Vision to improve their configuration recommendations.

## What happens next

Fresh scout configurations are picked up by the coordinator within about 30 minutes and draw from the verified daily run budget. Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/173637/inbox), where immediately actionable reports can begin coding tasks.
