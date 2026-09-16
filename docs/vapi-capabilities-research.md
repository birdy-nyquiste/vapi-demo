# Vapi capability research: tools, orchestration, evaluation

Research date: 2026-09-16. This is a documentation review, not a tested integration. Only official Vapi sources are used. Product availability, account entitlements, prices, and actual latency must be checked during implementation.

## Verified documentation findings

### Channels and conversation experience

The following official pages were reviewed by the companion researcher in this session:

- Browser calls use `@vapi-ai/web` with a public key and expose call/transcript events. Opt-in `assistant.speechStarted` supports captions whose timing depends on the speech provider. [Web quickstart](https://docs.vapi.ai/quickstart/web)
- Client-side tools can trigger UI actions, but cannot return tool results to the model. Use a server tool when its output must inform the next reply. [Client-side tools](https://docs.vapi.ai/tools/client-side-websdk)
- Endpointing and interruption behavior are configurable. Multilingual setup requires compatible transcription, voice, and prompt choices; actual Chinese and mixed-language experience needs testing. [Speech configuration](https://docs.vapi.ai/customization/speech-configuration), [Multilingual](https://docs.vapi.ai/customization/multilingual)
- Phone calls support inbound and outbound entry points. Free Vapi numbers are US numbers; other numbers can be imported. [Phone quickstart](https://docs.vapi.ai/quickstart/phone)
- OpenAI Realtime offers a speech-to-speech alternative, but its Vapi page explicitly lists Knowledge Bases as unsupported. Do not assume parity with the modular speech pipeline. [Realtime](https://docs.vapi.ai/openai-realtime)
- Live call controls include speaking, adding messages, muting, ending, transferring, and handing off. Server events expose lifecycle status, partial/final transcripts, speech events, and end-of-call artifacts. [Call controls](https://docs.vapi.ai/calls/call-features), [Server events](https://docs.vapi.ai/server-url/events)
- Text chat supports continued conversations through `previousChatId` and dynamic variables. [Chat quickstart](https://docs.vapi.ai/chat/quickstart)

### Orchestration

- Squads split a conversation among focused assistants, with explicit handoff tools. The first squad member starts the call; assistants can be saved or transient. Vapi advises small squads and clear functional boundaries. [Squads](https://docs.vapi.ai/squads)
- Handoffs can target an assistant, another squad, or a destination selected by a runtime webhook. Conversation context and extracted variables can be forwarded. This is AI-to-AI handoff; phone/SIP transfer is a different tool. [Handoff](https://docs.vapi.ai/squads/handoff), [Destinations](https://docs.vapi.ai/squads/handoff/destinations)
- Passing derived arguments inline with the handoff avoids an additional extraction request; `variableExtractionPlan` adds a separate model request; Liquid substitution forwards existing variables deterministically. The docs currently flag a Dashboard squad-builder limitation: per-member handoff configuration does not carry `function.parameters`; API-defined assistant tools are the stated workaround. [Passing data](https://docs.vapi.ai/squads/passing-data-between-assistants)
- Legacy Workflows were scheduled to stop running August 18, 2026. The current migration guide recommends Squads. Variable extraction is best effort and can be empty even when handoff proceeds. New work should use Squads. [Migration guide](https://docs.vapi.ai/workflows/legacy-migration)

### Tools and knowledge

- API Request tools call ordinary HTTPS endpoints synchronously. Function tools use Vapi's webhook envelope, support asynchronous execution, or run in the browser through Web SDK events. Server-side Function tools receive call context and can support live call control. [Tool selection](https://docs.vapi.ai/tools/api-request-vs-function)
- The tool catalog includes knowledge queries, phone/SIP transfer, handoff, MCP, and prebuilt Google Calendar, Google Sheets, Slack, and GoHighLevel integrations. [Tools](https://docs.vapi.ai/tools)
- Query tools retrieve from uploaded files configured as one or more knowledge bases. The prompt must explicitly say when to invoke the named tool. Vapi recommends well-structured files below 300 KB each for performance; this is a recommendation, not a stated hard upload limit. [Query tool](https://docs.vapi.ai/knowledge-base/using-query-tool)
- Tool configuration alone does not guarantee correct business behavior: model-generated values still require destination-side validation. API Request tools require valid JSON success responses, while synchronous Function responses correlate a string result with `toolCallId`. [Tool selection](https://docs.vapi.ai/tools/api-request-vs-function)

### Results and evaluation

- Structured outputs run after call completion, analyzing conversation and tool results against JSON Schema. They are not a live form-fill stream. Results are available at `call.artifact.structuredOutputs[outputId].result`; documentation says completion is typically within seconds, not an SLA. [Quickstart](https://docs.vapi.ai/assistants/structured-outputs-quickstart)
- Output definitions are reusable across assistants. Conditions can gate generation by minimum messages, duration, and ended reason. [Structured outputs](https://docs.vapi.ai/assistants/structured-outputs)
- Scorecards apply point rules to boolean or numeric structured outputs after the call. Their AI-derived inputs can be wrong, so a score should be compared with actual transcript and business state. [Scorecards](https://docs.vapi.ai/observability/scorecard-quickstart)
- Evals test an assistant or squad's next decision at supplied conversation checkpoints. They can check exact tool arguments, regex patterns, or semantic AI judgments. They run at text/model level and do not test audio or turn taking. [Evals](https://docs.vapi.ai/test/evals-best-practices)
- Simulations use an AI caller to exercise complete conversations. Chat mode omits transcription/speech, while voice mode tests that pipeline with a synthetic caller. Unmocked tools execute for real. A conversational claim of booking is not proof of a calendar entry. [Simulations quickstart](https://docs.vapi.ai/observability/simulations-quickstart)
- Simulations support tool-response mocks, initial variable values, lifecycle webhooks, repeated runs, and reusable structured-output criteria. [Advanced simulations](https://docs.vapi.ai/observability/simulations-advanced)

### Cost and practical capacity

- Public pricing currently lists $0.05/minute Vapi hosting, model costs passed through, and $5 initial credits. Treat this as the hosting component, not an all-in voice-call price. [Pricing](https://vapi.ai/pricing)
- The documentation explicitly adds model, voice, transcription, and telephony charges to hosting. New Usage-only accounts list four concurrent calls, two organizations, one Vapi number, and 14-day raw-data retention. Existing accounts may retain their prior arrangement. [Billing](https://docs.vapi.ai/billing/pricing-and-success-packages)

## Demo proposals, not product decisions

The strongest demonstration is a small complete service interaction with a visible evidence panel. A fictional equipment-rental desk or venue concierge could answer a catalog question from a knowledge base, search availability, accept a user correction, create a sandbox reservation, and show the actual record. An optional two-assistant squad can separate advisory questions from reservations. After the call, show the extracted request and a small scorecard.

The interesting moment should be an observable action: the correct item or time changes on screen and a real sandbox record appears. A second run can inject an unavailable slot or a tool error to show whether the agent recovers honestly. This makes the demonstration informative even when behavior is imperfect.

For exploration, compare one change at a time: single assistant versus squad, a successful tool versus a failure, or two speech/model configurations. Use Evals for exact tool arguments and Simulations for varied complete conversations. Neither synthetic evaluation nor a structured success label replaces checking the actual reservation state.

Possible first scope: one catalog, two tools (search and reserve), one correction journey, one failure journey, post-call summary. Add squads after the single-assistant path works so that handoff value can be demonstrated rather than assumed.

Alternative directions for discussion: a capability playground for controlled A/B comparisons, or a telephone service desk emphasizing inbound/outbound access and transfers. The browser-first concierge offers the clearest link between conversation and visible results; none of these options has been selected by the user.

## Implementation uncertainties to resolve

- Actual Chinese and mixed-language recognition, voice naturalness, and interruption handling need live audio trials.
- Any demo timing claim needs measured calls using the selected providers and network.
- Confirm current account capacity and billing before inviting simultaneous audience use.
- Confirm knowledge-tool source metadata before promising clickable per-answer citations in our UI; the query guide alone does not establish that display contract.
- Decide whether reservation data is local sandbox state or an actual external service. Label mocked responses and sandbox records accurately.
- Do not interpret a post-call extracted field as live state or a model-generated booking confirmation as successful persistence.
