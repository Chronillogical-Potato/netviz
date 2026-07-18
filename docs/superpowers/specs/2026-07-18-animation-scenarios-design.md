# Netviz Animation and Architecture Scenarios

**Status:** Product direction approved on 2026-07-18

**Purpose:** Durable design and implementation handoff for a later browser-enabled session

**Scope:** Animation authoring, deterministic playback, infrastructure scenarios, and a staged path to interactive or recorded output

## Decision

Netviz should not add the attached Animated Beam as an isolated visual effect or try to become a generic Framer clone.

Netviz should develop a **timeline-backed architecture scenario system**. The first visible release will focus on advanced connection effects, including a gradient beam preset inspired by Magic UI. The underlying document and playback model must already support later node states, sequencing, triggers, camera movement, and infrastructure-specific behavior.

The product goal is **animated infrastructure storytelling and simulation**:

- Show how a request travels through an architecture.
- Explain parallel work, retries, queues, replication, and responses.
- Demonstrate failure, failover, degradation, and recovery.
- Build presentation-ready scenarios without requiring code.
- Retain advanced manual motion controls for users who want them.

This gives Netviz a specific identity. Framer animates visual interfaces; Netviz will explain how systems behave.

## Reference Effect

The original reference was Magic UI's Animated Beam:

- <https://magicui.design/docs/components/animated-beam>
- A moving gradient travels along a curved SVG path.
- Controls include curvature, reverse direction, duration, delay, repeat, repeat delay, colors, width, opacity, and endpoint offsets.

Treat that component as a **visual reference and one effect preset**, not as the architecture for Netviz.

Do not copy its element-ref path calculation. Netviz already receives the exact XYFlow connection path from its custom edge renderer. All connection effects must reuse that path so they remain correct during canvas pan, zoom, rerouting, node movement, and export.

## Existing Foundation

The current application already has several useful foundations:

- XYFlow renders the canvas and supplies edge geometry.
- `src/components/edges/labeled-edge.tsx` owns the custom edge path and label.
- `src/index.css` contains the current moving-dash animation and Turbo styling.
- `src/store/flow-store.ts` stores the current per-edge animated flag, global animation speed, pages, undo state, and document data.
- `src/components/canvas-options.tsx` exposes the existing edge controls.
- Design and Preview modes already provide a natural authoring/playback boundary.
- Save/load and IndexedDB persistence already preserve the document.
- The current file format is version 1 and will require a migration when scenario data is added.

The current animation is deliberately simple: an edge is either animated or not, all animated edges share one duration, and CSS moves the dash offset. The new system replaces this boolean/global model with explicit per-effect timing while preserving old documents through migration.

## Product Model

### Scenario

A scenario is a named, playable explanation on a page. Examples:

- User login
- Image upload
- Cache miss
- Database failover
- Queue backlog and recovery
- Blue-green deployment

Each page can contain multiple scenarios. One scenario can be marked as the default preview scenario. Scenarios are page-owned because their targets and camera framing refer to that page's elements.

### Timeline

Every scenario has:

- A duration
- Playback rate
- Loop mode
- Optional loop region
- Tracks and clips
- Named markers
- Optional triggers

The timeline is the common clock for connection effects, node effects, labels, state changes, and camera cues. Playback is based on elapsed time rather than frame count so dropped frames do not desynchronize the scenario.

### Track

A track targets one of the following:

- Edge
- Node
- Group
- Label or annotation
- Page camera
- Scenario-level event

One target can have multiple tracks, such as opacity, glow, state, and position. Tracks hold clips or keyframes and remain declarative.

### Clip

A clip defines:

- Effect or animated property
- Start time and duration
- Delay and repeat delay when applicable
- Easing
- Loop count
- Reverse or ping-pong behavior
- Effect-specific parameters

Preset clips provide a fast authoring experience. Advanced controls expose the same underlying data rather than creating a separate system.

### Marker and Trigger

Markers name important timeline positions, such as `request-sent`, `database-read`, or `response-returned`.

Triggers remain declarative. Initial trigger types are:

- Manual play
- Preview start
- Click an element
- Hover an element
- Start after another clip
- Start when an edge effect reaches its target

Arbitrary JavaScript is explicitly excluded. It would make documents unsafe, difficult to validate, and impossible to export reliably.

### Transport

The transport is ephemeral runtime state:

- Playing or paused
- Current time
- Playback rate
- Active scenario
- Loop state

Transport changes must not enter undo history, persistence, or the saved document. Authored scenario changes are persisted and undoable; playback ticks are not.

## Architecture

### Separation of authored data and runtime projection

The saved diagram remains the source of truth for base node positions, styles, edges, and labels. Animation never overwrites the authored base values.

During playback, a runtime projection layer evaluates the active scenario at the current time and produces temporary values for rendering. Stopping or rewinding playback reveals the unchanged base document.

This separation prevents playback from:

- Polluting undo history
- Triggering IndexedDB writes every frame
- Changing the user's diagram accidentally
- Creating drift after repeated playbacks

### Central clock

Use one central `requestAnimationFrame` clock based on monotonic elapsed time. Do not run independent timers for individual effects.

The clock should notify only active animation targets. Do not write the current time into the primary Zustand document store and do not rerender the complete canvas on every frame.

The renderer should receive current values through a lightweight runtime channel, such as target subscriptions, imperative SVG updates, or another mechanism proven by profiling. The exact implementation may vary, but the constraints above are mandatory.

### Connection renderer

The custom edge renderer should have distinct layers:

1. Base path
2. Animated overlay or particles
3. Selection and interaction path
4. Label

Every effect uses the same XYFlow `path` value as the base edge. A connection effect must not calculate its own independent path from DOM rectangles.

The initial renderer can remain SVG-based. An effect may use gradients, masks, dash offsets, path length, or points sampled along the path. Keep the effect API independent from its SVG implementation so a future high-density renderer can move particles to Canvas or WebGL without changing document data.

### Node renderer

The first node effects should avoid changing layout geometry:

- Opacity
- Scale
- Glow
- Border sweep
- Color or state transition
- Pulse
- Shake

These can animate a node's visual content without breaking edge routing.

True positional node animation is a later phase and must use a transient geometry projection shared by both nodes and edges. Animating only the visible DOM wrapper is not acceptable because connected edges would remain at the base position. The implementation must validate the XYFlow runtime adapter before positional animation ships.

### Camera renderer

Camera tracks can animate:

- Pan
- Zoom
- Fit to selected targets
- Hold duration
- Transition easing

Camera playback must use the same scenario clock. Manual navigation during preview should either pause the scenario or temporarily override the camera track; the first implementation should pause camera playback to avoid competing controls.

## Connection Effect Controls

### Effect presets

- Moving dash
- Gradient beam
- Pulse
- Packet or traveling dot
- Particle stream
- Data burst
- Bidirectional traffic
- Request and response pair

### Motion controls

- Forward, reverse, bidirectional, or ping-pong
- Start time
- Duration or velocity
- Delay
- Repeat count
- Repeat delay
- Easing
- Phase offset
- Start and end path offsets
- Stagger for multiple selected edges

### Appearance controls

- Single color, two-color gradient, or multiple gradient stops
- Width
- Opacity
- Beam or trail length
- Particle count
- Particle size
- Particle spacing
- Glow color and strength
- Blur
- Fade at head and tail
- Blend mode where browser support is reliable

### Path controls

Path geometry and animation timing are separate concerns. Netviz should eventually support:

- Smooth step
- Straight
- Bezier curve
- Orthogonal routing
- Corner radius or curvature
- Manual waypoints

Changing the route must not require recreating the animation.

## Node and Group Controls

### Entry and exit

- Fade
- Scale
- Slide
- Rotate
- Blur

### Attention and activity

- Pulse
- Glow
- Shake
- Border sweep
- Icon pulse
- Status badge or label change

### Infrastructure states

- Idle
- Active
- Warning
- Failed
- Recovering
- Disabled

State changes can coordinate style changes and connection behavior. For example, a failed service can turn red, stop accepting request packets, and trigger a failover path.

### Multi-selection

Applying an animation to multiple selected objects should support:

- Same timing
- Stagger by layer order
- Stagger by selection order
- Forward or reverse stagger
- Editable interval

Mixed values must be represented honestly in the inspector rather than silently choosing the first selected value.

## Infrastructure Scenario Controls

The scenario layer builds domain behavior on top of the timeline:

- Request and response direction
- Protocol or operation label
- Latency
- Throughput or burst size
- Parallel branches
- Queue wait
- Retry count and retry delay
- Timeout
- Failure probability for demonstration mode
- Failover destination
- Replication fan-out
- Success, warning, and failure outcomes

These controls initially drive visualization rather than claiming to be an accurate production simulator. Netviz should call them scenarios or demonstrations until a real simulation model and validation rules exist.

## Authoring Experience

### Inspector

When an animatable element is selected, show an **Animation** section using the current Framer-style visual language.

The default view stays compact:

- Preset
- Direction
- Duration or speed
- Delay
- Play selection
- Add to scenario

An **Advanced** disclosure reveals effect-specific appearance and timing controls.

### Timeline drawer

A bottom timeline drawer appears only when the user enters timeline editing. It contains:

- Scenario selector
- Play, pause, restart, and loop controls
- Current time and total duration
- Scrubber
- Tracks aligned with layer names
- Clips and keyframes
- Zoomable timeline scale
- Markers

Closing the drawer returns to the normal canvas layout without removing scenario data.

### Canvas and layers

- The canvas toolbar gains a compact playback control when a scenario exists.
- Design mode remains calm and does not continuously autoplay animations.
- A selected clip or effect can be previewed on demand in Design mode.
- Preview mode runs the default or selected scenario without editing chrome.
- Animated layers show a small motion indicator.
- Deleting a target reports and removes or preserves its orphaned tracks according to an explicit confirmation policy; the first release should remove them in the same undoable action.
- Duplicating animated elements duplicates their tracks with new target IDs when the duplication happens within the same page.

## Persistence and Migration

The next file format version must add page-owned scenarios while continuing to load version 1 documents.

Migration rules:

- Existing nodes, edges, pages, and groups remain unchanged.
- Existing `animated: true` edges become moving-dash clips in a generated default scenario, preserving the current speed as closely as possible.
- Existing documents without animations do not gain an empty visible timeline.
- Existing Turbo styling remains a visual style unless explicitly converted to an animation effect later.
- Unknown future effects remain preserved in saved data even when the current renderer cannot play them, and the UI should report that limitation.

Scenario data must be included in:

- IndexedDB persistence
- JSON save and load
- Page switching
- Undo and redo
- Duplication
- Clear and reset operations

Runtime transport state must be excluded from all of the above.

## Performance Requirements

- Never persist or serialize on playback frames.
- Never update the primary document store on every animation frame.
- Use elapsed time, not accumulated frame increments.
- Pause rendering for offscreen or hidden targets when doing so does not break synchronization.
- Keep connection effects attached during pan, zoom, resizing, and node movement.
- Respect XYFlow's visible-element optimization.
- Batch particles into as few DOM/SVG elements as practical.
- Profile scenes with many simultaneous connections before selecting a particle rendering limit.
- Provide a graceful quality reduction before allowing animation to make editing unresponsive.

The initial acceptance target should include smooth playback with dozens of simultaneous animated connections on typical desktop hardware. A larger target must be chosen from browser profiling rather than guessed in advance.

## Accessibility and User Control

- Respect `prefers-reduced-motion` by default.
- Provide an in-app override for users intentionally authoring motion.
- Do not autoplay motion in Design mode.
- Avoid effects that depend on color alone to communicate success or failure.
- Keyboard controls must support play/pause, restart, and timeline stepping.
- Flashing effects must remain below unsafe frequencies.

## Export and Sharing

Static PNG and SVG exports capture the chosen timeline frame, defaulting to time zero or the current scrubber position.

Animated output is a later subsystem:

1. Interactive playback inside Netviz
2. Shareable interactive document or hosted preview
3. WebM recording
4. MP4 conversion if the deployment model can support it
5. GIF only when explicitly requested because of its poor color and file-size characteristics

Do not make video export a prerequisite for the animation engine. Deterministic interactive playback must work first.

## Error and Lifecycle Rules

- Missing animation targets are reported in the editor and skipped during playback.
- Deleting an element removes its tracks in the same undoable operation.
- Page switching stops the old page's playback and activates the new page at time zero.
- Loading a document stops current playback before replacing the document.
- Undoing an animation edit reevaluates the current frame without changing the current time unless the active scenario was removed.
- Invalid durations, repeat counts, colors, or easing values are clamped or rejected at the editor boundary.
- Unsupported effects do not crash playback; they render their base element and surface a warning.

## Delivery Stages

### Stage 1: Connection motion foundation

- Scenario and transport data model
- Central deterministic clock
- Moving dash migration
- Gradient beam preset
- Packet, pulse, and particle presets
- Per-edge timing and appearance controls
- Compact playback controls
- Save/load, undo, duplication, and multi-selection behavior

### Stage 2: Scenario authoring

- Named scenarios
- Timeline drawer
- Tracks, clips, markers, sequencing, and stagger
- Edge arrival events
- Request and response pairs
- Preview-mode scenario playback

### Stage 3: Node states and camera

- Non-geometric node effects
- Infrastructure states
- Label and annotation changes
- Camera tracks
- Failure, recovery, retry, and failover demonstrations

### Stage 4: Advanced motion

- Keyframe editor
- Custom easing curves and spring controls
- True positional node animation through the transient geometry adapter
- Manual connection waypoints and richer path routing
- Conditional scenario branches

### Stage 5: Sharing and recording

- Shareable interactive previews
- Current-frame static export
- Deterministic WebM recording
- Optional MP4 conversion strategy

Do not implement all stages at once. Stage 1 must establish the permanent document and playback boundaries so later stages do not require another migration or a second animation engine.

## Explicit Non-goals for the First Release

- Arbitrary user JavaScript
- Audio editing
- Video cuts or a general video editor
- Physics or collision simulation
- Production-accuracy claims for throughput or failure modeling
- Full positional node keyframing
- MP4 or GIF export
- Replacing XYFlow

## Testing Strategy

### Functional

- Play, pause, restart, seek, loop, reverse, and change playback rate.
- Edit timing and appearance for one or many selected edges.
- Confirm edge effects remain attached during pan, zoom, resize, move, and reroute.
- Confirm Preview mode plays without editor controls.
- Confirm Design mode does not autoplay.
- Confirm save/load, page switching, duplication, deletion, and undo preserve scenario behavior.
- Confirm version 1 files migrate without losing diagram content.

### Visual browser testing

- Compare the gradient beam against the Magic UI reference while retaining Netviz edge geometry.
- Test dark and light themes.
- Test dense crossings, short edges, long edges, loops, reverse direction, and bidirectional effects.
- Test selected, hovered, locked, hidden, grouped, and offscreen elements.
- Verify the timeline drawer does not obscure critical canvas controls.

### Performance

- Record frame pacing with increasing animated-edge counts.
- Verify playback does not trigger document persistence writes.
- Verify the primary canvas component and inspector do not rerender on every playback tick.
- Verify hidden tabs and backgrounded windows resume at the correct elapsed time.

### Accessibility

- Verify reduced-motion behavior.
- Verify keyboard playback and timeline controls.
- Verify visible focus states and non-color status cues.

## Next-session Handoff

The next browser-enabled session should:

1. Read this specification before changing code.
2. Inspect the existing uncommitted working tree and preserve all current user changes.
3. Check whether the user's development server is already running on port `8888`; use it if present and never stop or kill it.
4. Reinspect the current edge, canvas, store, storage, and inspector code because they are currently modified beyond the latest commit.
5. Use browser testing to capture the present edge behavior and establish a visual baseline.
6. Prototype only the Stage 1 rendering and runtime boundaries first.
7. Validate gradient beam behavior during pan, zoom, node movement, resize, selection, and Preview mode before expanding controls.
8. Keep the current Framer-style UI density and visual language.

The implementation session should not begin with a direct port of the Magic UI component. It should begin by protecting the data model, central clock, XYFlow path reuse, runtime/document separation, and browser performance boundaries described above.

## Final Product Principle

Every animation control should answer one of two questions:

1. **What is moving or changing?**
2. **What does that motion explain about the architecture?**

Decorative effects are welcome, but the long-term value comes from turning a static network diagram into a clear, controllable explanation of system behavior.
