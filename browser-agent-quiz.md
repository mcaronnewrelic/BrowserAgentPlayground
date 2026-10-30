# New Relic Browser Agent Demo Quiz

## Quiz authoring notes

- **Question count:** 30
- **Question types:** 10 multiple choice, 12 multiple answer, 8 fill in the blank
- **Audience prerequisite:** Learners should complete all eight Browser Agent demo pages and inspect their generated data in the shared New Relic account.
- **Fill-in-the-blank grading:** Treat accepted answers as case-insensitive. Ignore surrounding whitespace. Where an answer contains punctuation, the accepted variants list includes a punctuation-free option when appropriate.
- **Shared-account context:** Questions assume learners use their own `demoCode` value to distinguish their telemetry from other learners' data.

---

## Question 1

**Type:** Multiple choice  
**Topic:** Shared account workflow

**Question:** Why does each learner receive a session code such as `NR-A7K9`?

**Choices:**

A. It enables the Browser agent license.  
B. It lets the learner filter shared-account telemetry to their own demo activity.  
C. It selects the Browser agent version.  
D. It encrypts session replay data.

**Correct answer:** B

**Correct feedback:** Correct. The code is attached to telemetry as `demoCode` and is used in the supplied searches and NRQL queries to isolate your activity in the shared account.

**Incorrect feedback:** The account and application are shared by all learners. Review how `demoCode` is attached to events and used in each page's "Find it" queries.

---

## Question 2

**Type:** Multiple answer  
**Topic:** Shared account workflow

**Question:** Which steps are part of the workflow used throughout the eight demo pages? Select all that apply.

**Choices:**

A. Trigger telemetry by interacting with the demo page.  
B. Copy or use the NRQL supplied by the page.  
C. Filter results using your session code.  
D. Wait for the page's local activity feed to prove that New Relic stored the event.  
E. Inspect the resulting data in New Relic.

**Correct answers:** A, B, C, E

**Correct feedback:** Correct. The local page shows what it attempted, while New Relic is the source of truth for what was harvested and stored.

**Incorrect feedback:** Remember that several demos explicitly say their local feed cannot read New Relic's verdict. You must generate telemetry, query with your code, and inspect the stored result in New Relic.

---

## Question 3

**Type:** Multiple answer  
**Topic:** Browser logs

**Question:** With the demo application's manual log verbosity set to `WARN`, which log levels are collected? Select all that apply.

**Choices:**

A. `ERROR`  
B. `WARN`  
C. `INFO`  
D. `DEBUG`  
E. `TRACE`

**Correct answers:** A, B

**Correct feedback:** Correct. `WARN` keeps warning and error events; the less severe `INFO`, `DEBUG`, and `TRACE` events are filtered.

**Incorrect feedback:** The verbosity threshold keeps the selected severity and anything more severe. In the demo, `WARN` is above `INFO`, `DEBUG`, and `TRACE`.

---

## Question 4

**Type:** Multiple answer  
**Topic:** Browser logs

**Question:** Which methods did the Logs demo use to create Browser log events? Select all that apply.

**Choices:**

A. Automatic collection of browser `console` calls  
B. `newrelic.log()`  
C. `newrelic.wrapLogger()`  
D. `newrelic.noticeError()`  
E. `newrelic.recordCustomEvent()`

**Correct answers:** A, B, C

**Correct feedback:** Correct. The page demonstrates automatic console collection, direct API logging, and wrapping an application-owned logger.

**Incorrect feedback:** `noticeError()` reports errors, and `recordCustomEvent()` creates custom events. Review the three method cards on the Logs page.

---

## Question 5

**Type:** Fill in the blank  
**Topic:** Browser logs

**Question:** When a method is wrapped with `newrelic.wrapLogger()`, the method's ______ argument becomes the log message.

**Accepted answers:**

- first
- first argument

**Correct feedback:** Correct. The first argument passed to the wrapped logger method becomes the New Relic log message.

**Incorrect feedback:** Review the `appLogger` exercise and the note explaining which argument becomes the event's message.

---

## Question 6

**Type:** Multiple choice  
**Topic:** Browser logs

**Question:** Which event type should you query to find the messages produced by the Logs demo?

**Choices:**

A. `BrowserLog`  
B. `Log`  
C. `PageAction`  
D. `JavaScriptError`

**Correct answer:** B

**Correct feedback:** Correct. Browser log records are queried from the `Log` event type and can be filtered with `demoCode`.

**Incorrect feedback:** The demo's supplied NRQL begins with fields such as `timestamp`, `level`, and `message`, followed by `FROM Log`.

---

## Question 7

**Type:** Multiple answer  
**Topic:** Browser errors

**Question:** Which failures can the Browser agent capture automatically when application code does not catch them? Select all that apply.

**Choices:**

A. An uncaught JavaScript error  
B. An unhandled promise rejection  
C. Every handled error stored in a local variable  
D. An error explicitly suppressed by `setErrorHandler()`

**Correct answers:** A, B

**Correct feedback:** Correct. The agent listens for uncaught errors and unhandled promise rejections. Handled failures require reporting, and ignored errors are dropped.

**Incorrect feedback:** Automatic error capture applies when the application fails to catch the error. A caught error must be reported explicitly if you still want it recorded.

---

## Question 8

**Type:** Multiple choice  
**Topic:** Browser errors

**Question:** Your code catches an error and recovers, but you still want the failure reported to New Relic. Which API should you use?

**Choices:**

A. `newrelic.noticeError()`  
B. `newrelic.log()`  
C. `newrelic.finished()`  
D. `newrelic.addPageAction()`

**Correct answer:** A

**Correct feedback:** Correct. `noticeError()` reports a handled error even though the user-facing application recovered.

**Incorrect feedback:** Review the "Handled errors" card. The method is designed to report errors that your own code caught.

---

## Question 9

**Type:** Multiple answer  
**Topic:** Browser errors

**Question:** Which statements correctly describe return values from the demo's `newrelic.setErrorHandler()` rules? Select all that apply.

**Choices:**

A. Returning `true` drops the matching error.  
B. Returning `{ group: "Payment failures" }` assigns the matching error to that custom group.  
C. Returning `false` converts the error into a `Log` event.  
D. Returning `{ release: "2.4.1" }` performs the same function as `addRelease()`.

**Correct answers:** A, B

**Correct feedback:** Correct. The handler can cheaply discard noise or override how matching errors are grouped in Errors Inbox.

**Incorrect feedback:** Focus on the two rules exercised on the page: ignore with `true`, and group with an object containing `group`.

---

## Question 10

**Type:** Fill in the blank  
**Topic:** Browser errors

**Question:** In the "One failure, two signals" exercise, the JavaScript error and the ERROR log are correlated using the shared custom attribute named ______.

**Accepted answers:**

- errorId
- error id

**Correct feedback:** Correct. Matching `errorId` values let you connect the error's stack trace with the log explaining what the application was doing.

**Incorrect feedback:** Review the result queries for the "Both" button and compare the identifier present on both event types.

---

## Question 11

**Type:** Multiple answer  
**Topic:** Distributed tracing

**Question:** Which headers did the Tracing demo inspect after the Browser agent added distributed-tracing context to a request? Select all that apply.

**Choices:**

A. `traceparent`  
B. `tracestate`  
C. `newrelic`  
D. `x-demo-code`  
E. `server-timing`

**Correct answers:** A, B, C

**Correct feedback:** Correct. `traceparent` is the W3C trace-context header, while `tracestate` and `newrelic` carry information New Relic uses when joining telemetry.

**Incorrect feedback:** Review the "Headers on your last request" inspector. It identifies one W3C header and two additional trace-context headers.

---

## Question 12

**Type:** Fill in the blank  
**Topic:** Distributed tracing

**Question:** To make a browser log appear on the same distributed trace as a request, add the captured trace ID to the log using the recognized attribute ______.

**Accepted answers:**

- trace.id
- `trace.id`

**Correct feedback:** Correct. New Relic recognizes `trace.id` for log-in-context linking. A custom key such as `traceId` is stored but is not linked automatically.

**Incorrect feedback:** The exercise contrasts New Relic's recognized dotted attribute name with the unrecognized camel-case `traceId` key.

---

## Question 13

**Type:** Multiple choice  
**Topic:** Distributed tracing

**Question:** What must be configured before the Browser agent adds trace headers to an allowed cross-origin request?

**Choices:**

A. The destination origin must be listed under CORS in Browser Application settings.  
B. The request must use only the `POST` method.  
C. The browser must disable its same-origin policy.  
D. The response must have a `404` status.

**Correct answer:** A

**Correct feedback:** Correct. The destination origin must be allowed in the Browser application's CORS configuration before the agent adds its custom tracing headers.

**Incorrect feedback:** Browsers restrict custom headers on cross-origin requests. Review the cross-origin card and the Application settings guidance.

---

## Question 14

**Type:** Multiple choice  
**Topic:** Distributed tracing

**Question:** In the Tracing demo's browser-only mode, what result is expected?

**Choices:**

A. Browser spans and trace headers are visible, but there are no backend APM spans.  
B. A complete browser-to-database waterfall is always visible.  
C. No trace context is created at all.  
D. Only backend spans are visible.

**Correct answer:** A

**Correct feedback:** Correct. Static-file requests can demonstrate Browser spans and real trace headers, but a backend must run an APM agent to join and add backend spans.

**Incorrect feedback:** Browser-only mode still demonstrates trace propagation from the page. What it lacks is an instrumented backend that can join the trace.

---

## Question 15

**Type:** Fill in the blank  
**Topic:** Core Web Vitals

**Question:** The LCP, CLS, and INP measurements generated by the Vitals demo are stored as ______ events.

**Accepted answers:**

- PageViewTiming
- Page View Timing

**Correct feedback:** Correct. Each metric appears on a `PageViewTiming` event, identified by values such as `lcp`, `cls`, or `inp` in `timingName`.

**Incorrect feedback:** Review the "Find your vitals" section and the event type used in its supplied NRQL.

---

## Question 16

**Type:** Multiple choice  
**Topic:** Core Web Vitals

**Question:** In what unit are Browser timing durations stored in New Relic for this exercise?

**Choices:**

A. Nanoseconds  
B. Microseconds  
C. Milliseconds  
D. Seconds

**Correct answer:** D

**Correct feedback:** Correct. Although the page describes some interactions in milliseconds, the New Relic timing durations queried in this exercise are stored in seconds.

**Incorrect feedback:** Review the explanatory text immediately above the Vitals page's result queries.

---

## Question 17

**Type:** Multiple choice  
**Topic:** Core Web Vitals

**Question:** Why does the Vitals demo's "Load more now" action not count its immediate movement toward CLS?

**Choices:**

A. The movement is inside an iframe.  
B. Layout shifts within 500 ms of user input are excluded.  
C. CLS only measures image movement.  
D. The Browser agent ignores all button-driven changes.

**Correct answer:** B

**Correct feedback:** Correct. The immediate update occurs within the 500 ms exclusion window after user input; the delayed one-second update counts as an unexpected shift.

**Incorrect feedback:** Compare the immediate and delayed CLS buttons. The key difference is how long after the click the layout movement occurs.

---

## Question 18

**Type:** Multiple answer  
**Topic:** Core Web Vitals

**Question:** Which INP attributes can help explain which interaction was slow and where its latency occurred? Select all that apply.

**Choices:**

A. `interactionTarget`  
B. `inputDelay`  
C. `processingDuration`  
D. `presentationDelay`  
E. `releaseIds`

**Correct answers:** A, B, C, D

**Correct feedback:** Correct. These fields identify the interaction target and divide the delay into input, processing, and presentation portions.

**Incorrect feedback:** Review the Vitals page's Browser UI guidance. `releaseIds` belongs to JavaScript error release tracking, not INP diagnosis.

---

## Question 19

**Type:** Fill in the blank  
**Topic:** Frustration signals

**Question:** A rage click requires at least ______ clicks on the same element, with the first and last qualifying clicks less than one second apart.

**Accepted answers:**

- 4
- four

**Correct feedback:** Correct. The demo asks for four or more rapid clicks on the same element within about one second.

**Incorrect feedback:** Review the rage-click card and the exact threshold listed in "How the agent decides."

---

## Question 20

**Type:** Fill in the blank  
**Topic:** Frustration signals

**Question:** A dead click is detected after a click on a button or link followed by ______ seconds with no DOM update, request, or navigation.

**Accepted answers:**

- 2
- two
- 2 seconds
- two seconds

**Correct feedback:** Correct. The Browser agent watches for two seconds of inactivity after the click.

**Incorrect feedback:** Review the dead-click definition and the instruction to click the button and wait.

---

## Question 21

**Type:** Fill in the blank  
**Topic:** Frustration signals

**Question:** The `rageClick`, `deadClick`, and `errorClick` boolean fields are stored on the ______ event type.

**Accepted answers:**

- UserAction
- User Action

**Correct feedback:** Correct. The supplied query returns all three signal fields on each `UserAction` row so you can see which signal, if any, was detected.

**Incorrect feedback:** Review the event type in the "All your clicks" and signal-specific NRQL queries.

---

## Question 22

**Type:** Multiple answer  
**Topic:** Browser events

**Question:** Which statements about `newrelic.addPageAction()` were demonstrated? Select all that apply.

**Choices:**

A. It always creates the fixed event type `PageAction`.  
B. It automatically adds fields such as `actionName`, `timeSinceLoad`, and `referrerUrl`.  
C. It requires a route change before it saves an event.  
D. It is controlled by the `init.page_action.enabled` setting.

**Correct answers:** A, B, D

**Correct feedback:** Correct. `addPageAction()` explicitly creates `PageAction` data, includes useful automatic attributes, and has its own enablement setting.

**Incorrect feedback:** A route change is part of the automatic `BrowserInteraction` heuristic, not a requirement for an explicit `addPageAction()` call.

---

## Question 23

**Type:** Multiple choice  
**Topic:** Browser events

**Question:** What event type does the demo pass to `newrelic.recordCustomEvent()`?

**Choices:**

A. `PageAction`  
B. `UserAction`  
C. `DemoAction`  
D. `BrowserInteraction`

**Correct answer:** C

**Correct feedback:** Correct. The exercise intentionally stores the event under the custom type `DemoAction`.

**Incorrect feedback:** Unlike `addPageAction()`, `recordCustomEvent()` lets the application choose the event type. Review the type shown on the Custom event card.

---

## Question 24

**Type:** Multiple answer  
**Topic:** Browser events

**Question:** Which conditions must occur, in order, for the demo's automatic interaction heuristic to create a `BrowserInteraction`? Select all that apply.

**Choices:**

A. A click occurs.  
B. A URL or route change occurs after the click.  
C. A DOM update occurs after the route change.  
D. An AJAX request occurs before the click.  
E. A JavaScript error occurs.

**Correct answers:** A, B, C

**Correct feedback:** Correct. The demonstrated sequence is click, then route change, then DOM update. AJAX by itself does not produce its own `BrowserInteraction`.

**Incorrect feedback:** Compare the AJAX-only button with the route-change button. Only the ordered click → route change → DOM update sequence produces the automatic event.

---

## Question 25

**Type:** Multiple choice  
**Topic:** Session replay

**Question:** The app samples 10% of sessions for full replay. What did clicking "Start recording" do?

**Choices:**

A. It forced the current session into full recording regardless of the sampling roll.  
B. It increased the account-wide sampling rate to 100%.  
C. It unmasked every element on the page.  
D. It downloaded the replay to the learner's browser.

**Correct answer:** A

**Correct feedback:** Correct. `recordReplay()` guarantees recording for the current session without changing the application's account-wide sampling configuration.

**Incorrect feedback:** Review the explanation of `recordReplay()` and why the page says to click Start before trying the privacy examples.

---

## Question 26

**Type:** Multiple answer  
**Topic:** Session replay

**Question:** Match the replay privacy overrides to the behaviors demonstrated. Which statements are correct? Select all that apply.

**Choices:**

A. `nr-unmask` makes selected text readable in the replay.  
B. `nr-ignore` keeps an input visible but does not record its typed value.  
C. `nr-block` prevents an element and its children from being recorded, leaving an empty placeholder.  
D. `nr-ignore` makes all surrounding page text readable.  
E. `nr-block` records the element as ordinary masked text.

**Correct answers:** A, B, C

**Correct feedback:** Correct. The demo contrasts readable text, a visible input with no captured value, and a completely excluded element.

**Incorrect feedback:** Open the recorded replay and compare the unmasked line, ignored input, and blocked box. Each override has a different privacy behavior.

---

## Question 27

**Type:** Multiple choice  
**Topic:** Session replay

**Question:** Why does the Replay demo first query `UserAction` and `PageAction` for `session` and `hasReplay = true`?

**Choices:**

A. There is no flat `SessionReplay` event to query; the session ID is used to locate the recording in the replay player.  
B. Replays are stored as `Log` events.  
C. `hasReplay` starts a new recording.  
D. The replay player accepts only a JavaScript error message.

**Correct answer:** A

**Correct feedback:** Correct. A replay is opened as a recording in the Session replay UI. The query finds an event tied to that recording and returns its session ID.

**Incorrect feedback:** Review the "Find your replay" introduction. Replays are not represented as directly queryable flat rows.

---

## Question 28

**Type:** Multiple answer  
**Topic:** Manual SPA control

**Question:** Which results should appear after running the SPA demo's force-save and suppress exercises? Select all that apply.

**Choices:**

A. The client-only settings interaction forced with `.save()` should appear as a `BrowserInteraction`.  
B. The route-changing interaction passed to `.ignore()` should not appear in the result query.  
C. Both interactions must appear because both began with real clicks.  
D. `.save()` requires an AJAX request before it can report the interaction.

**Correct answers:** A, B

**Correct feedback:** Correct. `.save()` overrides the normal route-change heuristic, while `.ignore()` suppresses an interaction that otherwise would have qualified.

**Incorrect feedback:** The exercise demonstrates opposite overrides: force a normally ineligible interaction to save, and suppress a normally eligible interaction.

---

## Question 29

**Type:** Fill in the blank  
**Topic:** Manual SPA control

**Question:** On the route-naming exercise, the attribute that does not populate until the second click because the first interaction has no prior named route is ______.

**Accepted answers:**

- previousRouteName
- previous route name

**Correct feedback:** Correct. `previousRouteName` needs an earlier named route to reference, so the first click has no value to look back to.

**Incorrect feedback:** Compare the `previousRouteName` and `targetRouteName` columns in the supplied `BrowserInteraction` query.

---

## Question 30

**Type:** Multiple answer  
**Topic:** Manual SPA control

**Question:** Which statements about the SPA demo's top-level Browser APIs are correct? Select all that apply.

**Choices:**

A. `setCurrentRouteName()` assigns a route pattern used by SPA interaction telemetry.  
B. `setPageViewName()` renames the initial `PageView` and must run before the window `load` event.  
C. `finished()` is a custom page-completion timing marker and produces a `PageAction` named `finished` in this exercise.  
D. All three methods are chained from the handle returned by `interaction()`.  
E. `finished()` suppresses the current `BrowserInteraction`.

**Correct answers:** A, B, C

**Correct feedback:** Correct. These are separate top-level APIs: one names SPA routes, one renames the initial page view before load, and one records an application-defined completion marker.

**Incorrect feedback:** Review the distinction between methods chained from an `interaction()` handle and separate top-level `newrelic.X()` calls.
