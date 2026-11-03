# Tetris — Feature Roadmap

Updated: 03 NOV 2026

9 planned features · 4 delivery phases · Dependency-led order · No committed release dates

[Open the styled HTML version](roadmap.html)

Grow from a shared-screen game into a connected competitive experience. Keep local play simple, make profiles portable, then bring players together online.

## Existing foundation

The app already supports solo play, two local boards with alternating turns, named local profiles, temporary Guests, individual preferences and key mappings, high scores, round metrics, lifecycle logging, a Gradle build, and Docker hosting. The features below extend that foundation; none is marked complete.

<a id="local"></a>

## PHASE 01 — Make the shared screen work harder.

Finish the local experience before introducing accounts or network dependencies.

<a id="feature-1"></a>

### 01. Resume after restarts and crashes

**Status:** Planned

Recover the latest valid local game after a refresh, browser closure, app restart or unexpected crash.

- Save versioned checkpoints after meaningful changes, with throttled periodic saves during active play; do not rely only on a browser shutdown event.
- Restore each board, active and queued pieces, randomizer state, hold state, score, lines, difficulty, active-play metrics, participating profile IDs and the current multiplayer turn.
- Offer Resume saved game or Discard on relaunch. Always restore paused, with no elapsed time charged while the browser was closed.
- Validate snapshots, handle incompatible or corrupt data safely, and keep the last valid checkpoint when a save fails. Explain that recovery is limited to the most recent successful save.
- Keep recovery local to the same browser and origin. Named-profile games are eligible by default; saving a match with Guest boards requires explicit opt-in so Guests remain temporary by default.

**Ready when:** Refresh, forced browser termination and a container restart can recover a compatible saved game at the same origin. Pause, turns and metrics remain correct; corrupt data, storage failure and missing profiles do not prevent starting a fresh game. Completed or deliberately discarded games are not offered for recovery.

**Dependencies:** existing local profiles, game state and metrics. No account or network service required.

<a id="feature-2"></a>

### 02. Adaptive shared-screen multiplayer

**Status:** Planned

Let more local players join when the display can comfortably fit their boards.

- Expand beyond the current two-board setup with a local player lobby and add/remove seats.
- Calculate the allowed player count from available screen space and a minimum readable board size.
- Keep each player’s appearance, audio, controls, score and turn indicator separate.
- Offer alternating turns and simultaneous local play as explicit choices; keep two-player Versus distinct.

**Ready when:** Resizing never makes boards unreadable or silently removes a player. If the screen becomes too small, pause and offer a clear layout or player-count adjustment.

**Dependencies:** existing local profiles and board rendering.

<a id="feature-3"></a>

### 03. Fair two-player matches

**Status:** Planned

Turn two independent boards into a clear, comparable head-to-head match.

- Add shared match rules for starting speed, scoring, progression and the win condition.
- Let visual, audio and input preferences remain personal; distinguish casual custom games from standard matches.
- Show ready states, a start countdown, the result, a tie outcome and a rematch action.
- Use equivalent piece sequences for comparable matches and show both scores and round metrics.

**Ready when:** Both players see the rules before starting, the same result at the end, and can replay without losing their preferences.

**Dependencies:** [02 · Local multiplayer](#feature-2).

<a id="cloud"></a>

## PHASE 02 — Give every player a home.

Introduce identity and durable storage, then make the experience portable.

<a id="feature-4"></a>

### 04. Player accounts and a persistent store

**Status:** Planned

Create a secure account-backed foundation for profiles that outlive one browser.

- Add sign-up, login, logout and account recovery with a managed identity provider.
- Create backend storage for player identity, per-player settings and personal bests.
- Enforce ownership checks so one account cannot change another player’s data.
- Keep local Guest play available; add basic admin access roles and account-support controls here.

**Ready when:** A player can sign in and retrieve their own saved profile, recover access, and sign out without exposing private account data to the next person.

**Dependencies:** stable profile data model. Basic administration starts here; expanded tools follow in [07](#feature-7).

<a id="feature-5"></a>

### 05. Settings sync and local-profile migration

**Status:** Planned

Make “my game, on any machine” a reliable everyday experience.

- Restore appearance, sound, difficulty, key mappings and high scores after login on a different machine.
- Offer an explicit, optional import of an existing named local profile into an account.
- Handle offline changes, sync retries and conflicting updates without silently overwriting preferences.
- Keep Guests temporary. Switching accounts must also switch the active settings and scores.

**Ready when:** A settings change on machine A appears after signing in on machine B. Offline edits have a clear saved/syncing state and a predictable conflict resolution.

**Dependencies:** [04 · Accounts and persistent storage](#feature-4).

<a id="online"></a>

## PHASE 03 — Bring separate screens together.

Deliver reliable online matches, with the controls needed to operate them.

<a id="feature-6"></a>

### 06. Online rooms and live Versus

**Status:** Planned

Let signed-in players on different machines compete in the same match.

- Start with private two-player rooms, shareable room links or join codes, and ready states.
- Synchronize match rules, start times, opponent progress, scores and final results.
- Validate competitive game state and results on the server rather than trusting submitted scores.
- Define reconnect windows, disconnect outcomes and clear connection status before adding public matchmaking.

**Ready when:** Two separate machines can finish a match with the same authoritative result. A lost connection produces a predictable recovery or match-ending outcome.

**Dependencies:** [03 · Match rules](#feature-3), [04 · Accounts](#feature-4), and [05 · Profile sync](#feature-5).

<a id="feature-7"></a>

### 07. Admin and moderation tools

**Status:** Planned

Give authorized administrators focused controls for a safe, manageable online service.

- Expand the account-support baseline into role-based player and room management.
- Support reports, account restrictions and closing abandoned or problematic rooms.
- Separate player, organizer and administrator permissions, enforced by the backend.
- Add tournament oversight permissions before tournaments launch; keep the interface focused on actual operational needs.

**Ready when:** Only the appropriate roles can perform protected actions, and administrators can handle a reported player or problematic room without direct database edits.

**Dependencies:** Baseline in [04](#feature-4); full rollout depends on [06 · Online rooms](#feature-6) and precedes tournament launch.

<a id="events"></a>

## PHASE 04 — Turn matches into an event.

Start with private, single-elimination tournaments, then make joining effortless.

<a id="feature-8"></a>

### 08. Tournament creation and live brackets

**Status:** Planned

Give organizers and players one clear view of an entire competition.

- Create private tournaments with a title, player limit, schedule and shared match rules.
- Begin with single elimination, including non-power-of-two entrants and byes.
- Clearly display upcoming, active and completed matches, results and the eventual winner.
- Advance winners using validated results; define no-show and organizer-resolution rules.

**Ready when:** An organizer can run a small event from creation to a final winner, while every entrant can understand the bracket and find their next match.

**Dependencies:** [06 · Online matches](#feature-6) and [07 · Admin and organizer roles](#feature-7).

<a id="feature-9"></a>

### 09. Invite players and coordinate participation

**Status:** Planned

Make it easy to join a tournament and know what to do next.

- Invite registered players in-app or share a tournament invitation link.
- Support accept, decline, pending, expired and revoked invitations, with capacity checks.
- Show the confirmed roster, check-in status, match readiness and links into assigned rooms.
- Notify players of their next match and bracket updates; add email delivery only after choosing an email provider.

**Ready when:** An invited player can accept once, appear in the roster, enter the correct match and follow live progress. Expired or full invitations explain the next step.

**Dependencies:** [04 · Identity](#feature-4) and [08 · Tournament model and brackets](#feature-8). Deliver 08–09 together for the first usable private event.

## Recommended delivery path

Local recovery → Local multiplayer → Fair Versus rules → Accounts + storage → Profile sync → Online rooms → Admin tools → Tournaments → Invitations

## Keep these promises throughout

- Preserve solo and offline local play; online services should not become a requirement for either.
- Keep settings personal and competitive rules shared.
- Continue responsive browser support, accessible controls and reduced-motion options.
- Carry forward automated checks, lifecycle logging and stable player/session identifiers.

## Decisions before implementation

- Choose a minimum board size and test real displays before setting player-count limits.
- Agree on Versus win conditions, input behavior and fairness rules.
- Select identity, database, hosting and real-time transport providers during Phase 02 planning.
- Defer public matchmaking, leagues, advanced tournament formats and native mobile apps.

---

Planning document · All nine features are proposed, not released. Scope and dates may evolve.
