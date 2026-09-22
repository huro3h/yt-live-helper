---
name: yt-live-helper
description: Architecture and history for the yt-live-helper Chrome extension (formerly youtube_live_hopper / YouTubeLiveHopper; a small grab-bag of YouTube viewing conveniences — auto-seeks live pages to the live head, switches live chat from "Top chat" to "all chat", locally hides the creator's pinned-message banner and in-chat polls, sorts live channels to the top of the sidebar's subscription list, and forces playback quality across all of youtube.com). Use when extending or debugging this extension, understanding why it was pared down from a multi-feature channel-hopper before growing back into a small convenience collection, why the standalone yt-auto-quality-lite extension was absorbed into it, or dealing with the MAIN/ISOLATED content-script world split.
---

# yt-live-helper — development notes

A minimal, dependency-free Manifest V3 Chrome extension: a small grab-bag of
"make watching YouTube nicer" conveniences. Framing note: the manifest
`description` is deliberately generic —
「YouTubeの視聴を快適にする便利機能を詰め合わせたChrome拡張機能」— so that adding
a feature no longer requires editing it. Do **not** narrow it back to a
single-feature sentence, and note it was widened from 「YouTube Liveの視聴を…」
when the quality feature (which also runs on VODs and Shorts) was absorbed;
don't re-scope it to Live only. The extension **name** stays
`YouTube Live Helper` — Live remains the center of gravity.

Seven features today, each with its own popup toggle (all stored in
`chrome.storage.local`; every toggle defaults `true` except `useMaxQuality`,
which defaults `false`):

- **Live-head auto-seek** (`常に最新位置から再生`, key `jumpToLive`) — on opening
  a live watch page, seek the player to the live head. `content.js`.
- **Chat auto all-view** (`チャットを常に全表示`, key `allChat`) — switch the live
  chat from the default "トップチャット"(Top chat) to "チャット"(all chat).
  `chat.js`.
- **Pinned-message auto-hide** (`固定メッセージを自動で非表示`, key `hidePinned`)
  — hide the creator's pinned-message banner from *your own* view via injected
  CSS. `chat.js`. Purely local; never touches YouTube's "unpin" action.
- **Poll auto-hide** (`アンケートを自動で非表示`, key `hidePolls`) — hide the
  creator's in-chat poll from *your own* view via injected CSS. `chat.js`.
  Purely local. Also cleans up the broken poll stub YouTube leaves in all-chat
  mode (see chat.js notes).
- **Live-channel sort** (`ライブ中のチャンネルを上に表示`, key `sortLiveChannels`) — in
  the left sidebar's 登録チャンネル list, move the channels that are currently live
  to the top. `guide.js`. Runs on all of `https://www.youtube.com/*` (the guide is
  everywhere), top frame only.
- **Subscriptions auto-expand** (`登録チャンネルを常に展開`, key
  `expandSubscriptions`) — click 「もっと見る」 once on load and leave the whole
  subscription list expanded. `guide.js`. Also what materializes the hidden
  entries the sort needs (see below).
- **Quality auto-set** (`画質を自動設定`, key `autoQuality`) — force playback
  quality to a configured default (key `defaultQuality`, `"hd1080"`) or to the
  best available (key `useMaxQuality`, default `false`, takes priority).
  `quality-bridge.js` + `quality-inject.js`. **Like `guide.js`, and unlike the
  four live/chat features, this runs on all of `https://www.youtube.com/*`**
  (VODs and Shorts included), not just live pages — absorbed from the standalone `yt-auto-quality-lite` extension
  (see below).

The popup is split into three `.section` blocks with small headings —
「ライブ配信」(the four live features),「サイドバー（登録チャンネル）」(the two guide
features) and「画質（通常動画・Shorts含む）」— the heading on the quality block is
what tells the user it isn't Live-only. The
quality block's two sub-rows (`常に最高画質を使う`, `デフォルト画質`) live in
`#qualityFields`, dimmed + `pointer-events:none` via `.sub-rows.disabled` when
`autoQuality` is OFF; the `<select>` is additionally `disabled` when
`useMaxQuality` is ON, since the default quality is unused then.

**Pitfall caught in E2E during the merge:** a `<select>` with no `selected`
attribute shows its **first** option (`4320p (8K)`) until JS assigns a value, so
`popup.js` must set `defaultQualitySelect.value` **unconditionally** —
`stored.defaultQuality ?? DEFAULT_QUALITY` — not only when a stored string
exists. Playback was still correct (the bridge supplies the default via
`storage.get(DEFAULTS)`); it was the popup that lied about the current setting.
Keep this in mind for any future `<select>` added here.

Popup labels are plain text (no leading emoji — an earlier ⚡/💬 pass was
removed at the user's request). **There is no toast/confirmation on toggle** —
the `showToast()` helper, its `.toast` element and CSS were removed at the
user's request (the toggle's own state is the feedback); don't reintroduce
feedback UI when adding a toggle. The popup header shows the extension name with
the current version at its right edge; the version is read at runtime from
`chrome.runtime.getManifest().version`, so a release only needs the
`manifest.json` bump — never hardcode it in `popup.html`.

## Release / changelog workflow (follow this)

The process (Keep a Changelog + SemVer, `CHANGELOG.md` with a `[Unreleased]`
section, `manifest.json` version bump, annotated tag) is the workspace-wide
convention — see **rule 4** of `~/projects/.claude/skills/projects-workspace/SKILL.md`
(skill: `projects-workspace`). Don't restate the steps here.

Project-specific:

- The user relies on this `CHANGELOG.md` **in place of GitHub Releases**, so
  keeping `[Unreleased]` current in the *same commit* as each user-facing change
  is a standing, non-optional request (this repo is more release-note-driven
  than most in the workspace).
- Tags take **no `v` prefix** — matches the existing `1.0.0`/`1.1.0`/`2.5.0`.
- **Push over SSH; `gh` is intentionally not used here.**

## History — this used to be a much bigger extension

The original v1 was a full "channel hopper": YouTube Data API v3 keyword
search, topic-channel registration (scraping `ytInitialData` off `/live`
pages via `background.js`), a merged/curated channel list in the popup, and
an auto-hop-to-next-channel feature that watched for the player's
`ended-mode` class (plus a 60s API-polling fallback) to detect stream end and
jump to the next channel in the list.

All of that was deliberately removed in a v2 rewrite — the user wanted only
the live-head auto-seek behavior, nothing else. Removed: the YouTube Data API
integration (no more API key input/storage), keyword search, topic-channel
registration/list, the merged channel list UI, prev/next/refresh controls,
the auto-hop-on-end feature, and `background.js` entirely (no service worker
needed once there's no cross-tab channel-switching state to own).

If a past version of this extension is ever referenced (docs, old commits,
memory from a prior session), assume it described the removed multi-feature
version — verify against current `manifest.json`/`content.js` before trusting
it.

**Rename:** the project was renamed `youtube_live_hopper` / `YouTubeLiveHopper`
→ repo `yt-live-helper`, display name `YouTube Live Helper`, skill
`yt-live-helper`, and the local working-copy directory
`~/projects/yt-live-helper` (to match the `yt-*` prefix of sibling extensions
like `yt-auto-quality-lite`, and because "Hopper" was a leftover from the
removed channel-hopper). Note the Claude Code project-memory dir is still keyed
to the old path (`-Users-huro3h-projects-youtube-live-hopper`) — that key is
frozen at creation and doesn't follow the directory rename.

## Merge — `yt-auto-quality-lite` was absorbed into this extension (2026-08-29)

The quality feature was its own standalone unpacked extension,
`~/projects/yt-auto-quality-lite`, until the user asked to run **one** extension
instead of two. What the merge changed vs. the original:

- Scripts moved `src/scripts/{bridge,inject}.js` → `quality-bridge.js` /
  `quality-inject.js` at the repo root (this repo is flat; there is no `src/`).
- Storage moved `chrome.storage.sync` → **`chrome.storage.local`**, to match the
  four existing features. Nothing is migrated — the old extension's `sync` data
  belongs to a different extension ID and is unreadable from here anyway, so
  quality settings simply start at their defaults after the merge.
- CustomEvent names re-prefixed `ythq:` → **`ylh:quality-settings` /
  `ylh:quality-request`**.
- Added the `autoQuality` master toggle, which the standalone version had no
  equivalent of (it always applied). OFF also stops the fallback interval.
- `minimum_chrome_version: "111"` came along with it — required for
  `world: "MAIN"` in `content_scripts`. Don't drop it.
- `host_permissions` was **not** carried over: content-script `matches` are
  enough for what this does, and adding it would only widen the install warning.

The old repo is kept on disk with a "merged / deprecated" note at the top of its
`README.md`, and **archived (read-only) on GitHub** as of 2026-08-29 — so it can
still be read and cloned, but nothing can be pushed to it without unarchiving
first. Its skill
`yt-auto-quality-lite` is still the deeper reference for *why* the undocumented
player API is the only option and for the Puppeteer/Chrome-for-Testing recipe;
read it before touching quality code here, but treat this file as authoritative
for how the feature is wired **now**.

## How it works now

Five content-script entries (two live/chat, one guide, two quality), no
`background.js`, no `host_permissions`. Only the `storage` permission.

### Live-head auto-seek — `content.js`

`content.js` (ISOLATED world), injected on
`https://www.youtube.com/watch*` and `https://www.youtube.com/live/*` at
`document_idle`.

- Reads `jumpToLive` from `chrome.storage.local` on load and via
  `chrome.storage.onChanged`, so toggling the popup switch applies without a
  page reload if the SPA navigates again. **The initial run happens inside the
  `storage.get` callback, not synchronously at script end** — see the 2.6.1 bug
  below; a synchronous first run reads the `true` default and ignores an OFF
  setting on every fresh page load.
- Listens for YouTube's `yt-navigate-finish` document event (the same signal
  `quality-inject.js` uses to detect SPA navigation) plus runs once on initial script load, dedup'd by video ID
  (`?v=` on `/watch`, or the path segment on `/live/<id>`) so it only acts
  once per video, not on every SPA event for the same video.
- Live detection is `document.querySelector('.ytp-time-display.ytp-live')` —
  the `ytp-live` class is added to the time display **only** while the player
  is showing a live broadcast. Polls for it up to 15s (300ms interval) in case
  the player hasn't mounted yet, then gives up silently.
- **Do NOT use the presence of `.ytp-live-badge` as the live test** — this was
  the 2.6.1 bug (see below). Once live-ness is established, the seek uses two
  mechanisms together (belt-and-suspenders): clicking `.ytp-live-badge` (the
  "LIVE" button) and calling the player's undocumented `seekToLiveHead()`.

#### The 2.6.1 bug — `.ytp-live-badge` exists on *every* video

Earlier versions assumed `.ytp-live-badge` is only in the DOM for live
broadcasts and therefore clicked it unconditionally. **That assumption is
false**, verified by DOM inspection in Brave:

| | `.ytp-live-badge` | computed `display` | `.ytp-time-display` classes |
|---|---|---|---|
| live | present | `inline-block` | `ytp-time-display notranslate ytp-live` |
| VOD  | **present** | **`none`** | `ytp-time-display notranslate` |

So the extension clicked a hidden live badge on **every** `/watch` page, and
that click corrupts the playback position of normal videos (measured A/B:
without the extension the video plays normally; with it, playback is thrown to
a wrong position — the user saw the seek bar run to the end and the video
finish; in the Brave harness it landed at 0 and paused). Shorts opened at a
`/watch?v=` URL were hit identically; `/shorts/<id>` URLs are untouched because
the content script isn't injected there.

Other measured facts worth keeping:
  - `player.seekToLiveHead()` (MAIN world) is a genuine **no-op on a VOD** —
    playback continues undisturbed. The damage came purely from the badge click.
  - The badge appears in the DOM at ~800ms, *before* `readyState` reaches
    `interactive`/`complete`, i.e. before the content script runs at
    `document_idle`. So the poll always matched on its very first tick — the
    bug fired on every page load, not intermittently.
  - On a live page the badge carries `disabled=true` + class
    `ytp-live-badge-is-livehead` while you are at the live head, and
    `element.click()` on a disabled button dispatches no event — so the click is
    harmlessly ignored in that case. **Don't add a `!badge.disabled` guard**: at
    the moment the content script runs the flag is still `true` even on a page
    that is actually behind the live head (measured), so guarding on it would
    skip the seek exactly when it's wanted.
  - Regression check for any future change here: with the extension loaded on a
    normal video, a page-level capture listener must observe **zero** synthetic
    (`isTrusted: false`) clicks on `.ytp-live-badge`, and playback must advance
    normally. See "E2E" below.
- **Note:** from the ISOLATED world, `player.seekToLiveHead()` is actually
  *not callable* (see world gotcha below) — the seek works because of the
  `.ytp-live-badge` click, which is a plain DOM click. The
  `seekToLiveHead()` call is a dead no-op belt kept only because it's
  harmless; don't rely on it as the mechanism.

### Chat features — `chat.js` (all-view switch + pinned-message hide)

`chat.js` (ISOLATED world), injected on `https://www.youtube.com/live_chat*`
with **`all_frames: true`** — the live chat is a *same-origin iframe*
(`#chatframe`, src `…/live_chat?…`) nested in the watch page, and content
scripts reach subframes only when `all_frames` is set. This is a **separate
`content_scripts` entry** from `content.js` (which matches only the top-frame
watch/live URLs), so `content.js` never runs in the chat frame and `chat.js`
never runs in the top frame. Purely DOM/CSS — no player methods — so ISOLATED
world is fine (no MAIN-world bridge needed). Handles two features (`allChat`,
`hidePinned`, `hidePolls`), read once from `chrome.storage.local` on load.

**Pinned-message hide (`hidePinned`).** Injects one `<style id="ylh-hide-pinned">`
into the chat iframe:
`yt-live-chat-banner-renderer:has(yt-live-chat-text-message-renderer){display:none!important;}`.
The pinned message is a banner in `yt-live-chat-banner-manager#live-chat-banner`;
targeting the renderer that *contains a text-message* hides only pinned
messages (polls etc. stay visible), and the manager collapses from ~44px to 0.
Toggled live via `chrome.storage.onChanged` (add/remove the style element), no
reload needed. CSS (not element removal / clicking) was chosen deliberately:
it auto-applies to re-pinned messages with no MutationObserver, and it never
invokes YouTube's own dismiss.
  - **Why not click YouTube's "メッセージの固定を解除" (unpin) menu item:** it
    exists in the banner's kebab ("チャットの操作") menu and *does* remove the
    banner — verified via Playwright/Brave that in an anonymous session it drops
    `has-active-banner` and the renderer count to 0. But "固定を解除" is
    semantically *unpin*, and for a moderator/owner it would very likely unpin
    for **all** viewers (can't be tested anonymously). The user chose the
    local-hide approach precisely to avoid that risk. If you ever revisit,
    don't switch to clicking that item without solving the mod/owner case.
  - Verified end-to-end with the extension loaded in Brave: style injected,
    banner renderer `display:none`, manager height 0 (and `allChat` switched to
    "チャット" in the same run).

**Poll hide (`hidePolls`).** Injects one `<style id="ylh-hide-polls">`:
`#action-panel:has(yt-live-chat-poll-renderer),yt-live-chat-banner-renderer:has(yt-live-chat-poll-renderer){display:none!important;}`.
The creator's in-chat poll is `yt-live-chat-poll-renderer`, and — the
non-obvious part, learned via Playwright/Brave on a live poll — **its container
moves depending on the chat view mode**:
  - **Top chat:** the poll lives in `#action-panel` (bottom of chat), rendered
    correctly (~174px).
  - **All chat:** YouTube *moves* the poll up into
    `yt-live-chat-banner-manager` as a `yt-live-chat-banner-renderer`, and there
    renders it as a **broken ~32px stub** (only the first choice, no question).
    This is native YouTube behavior — reproduced identically **without** the
    extension by manually switching to all-chat, so it is *not* our bug; our
    `allChat` feature just surfaces it every time. Since YouTube won't render
    the poll properly in all-chat anyway, hiding it cleanly is the right fix
    (and it's what the user wanted regardless).
  - Hence the CSS targets **both** containers. `#action-panel:has(poll)` fully
    collapses the bottom panel to 0; `banner-renderer:has(poll)` kills the
    all-chat stub. Verified E2E (extension loaded, all-chat): both style
    elements present, poll height 0, no stub in the screenshot.
  - Because `hidePinned` is scoped to `:has(yt-live-chat-text-message-renderer)`
    it never touched the poll banner — that's why polls needed their own rule.

**All-view switch (`allChat`).**

- Reads `allChat` from `chrome.storage.local`; if `true`, runs once. Guards
  with `location.pathname.startsWith('/live_chat')` as a belt.
- The mode switch is the `#view-selector` dropdown in the chat header (the
  "トップチャット / チャット" selector). Two-phase, polled up to 15s (300ms):
  phase 1 clicks the trigger to open the menu; phase 2, once the menu items
  render, clicks the **last** item (= all-chat; Top chat is first and is the
  default). If the already-selected item (`aria-selected="true"` /
  `.iron-selected`) is already the last, it closes the menu and no-ops.
- Chosen "click the last / the non-selected item" over matching the label
  text so it's language-independent. Item selectors are defensive
  (`tp-yt-paper-listbox a` → `#menu a` → `a.yt-dropdown-menu`) because the
  exact live_chat DOM wasn't introspected — **verified working in the real
  UI by the user**, but if it breaks, this selector chain and the
  first/last-index assumption are the first things to re-check.
- Runs once per iframe load. Not yet confirmed whether an SPA video-change
  reloads the chat iframe (which would re-inject `chat.js`) or reuses it
  (which would not re-run) — verify if switching videos ever stops
  auto-switching.

### Sidebar guide — `guide.js` (live-channel sort + subscriptions auto-expand)

`guide.js` (ISOLATED world), injected on `https://www.youtube.com/*` at
`document_idle`, top frame only. Pure DOM moves — no player methods, no CSS
hiding — so ISOLATED is fine. Verified end-to-end in the user's logged-in Chrome
Dev profile (2026-09-22): 7 live channels lifted to the top, 0 live channels left
behind in 「もっと見る」, temp style cleaned up.

- **Finding the section**: the 登録チャンネル section is the
  `ytd-guide-section-renderer` whose `#items > ytd-guide-collapsible-section-entry-renderer`
  header links to `/feed/subscriptions`. Don't match on the heading text (language
  dependent) and don't index the sections positionally — マイページ is *also* a
  collapsible-section header (`/feed/you`).
- **Live detection is `entry.querySelector('.guide-entry-badge svg')`.** Only a
  live entry gets the red live icon stamped inside its badge. Measured on all
  three states (matches the Polymer `data.badges.liveBroadcasting` exactly):

  | | `.guide-entry-badge` | badge `display` | badge has `svg` | `#newness-dot` |
  |---|---|---|---|---|
  | live | present | `block` | **yes** | `none` |
  | new content (blue dot) | present | `none` | no | `block` |
  | nothing | present | `none` | no | `none` |

  So the badge *element* exists on every entry — same trap as the 2.6.1
  `.ytp-live-badge` bug; presence is not the test. `aria-label` does say
  「ライブ配信中。」 but is language dependent, and `entry.data.badges` is
  Polymer state, invisible from ISOLATED.
- **The hidden channels are not in the DOM.** `#items` holds only the ~7 visible
  entries plus the `ytd-guide-collapsible-entry-renderer` (「もっと見る」). The rest
  (93 in the user's account) are stamped into `#expanded > #expandable-items`
  *only when the list is first expanded*, and they stay in the DOM afterwards.
  So the sort must expand once (`#expander-item a` click) to materialize them.
  This is why the sort matters at all: 6 of the user's 7 live channels were
  hidden behind 「もっと見る」.
- **Order of operations (measured, non-obvious): collapse first, then move.**
  Moving entries into `#items` and *then* clicking 「折りたたむ」 makes Polymer
  re-stamp `#items` and silently undo every move. Expand → collapse → move sticks
  (through SPA navigation too).
- **Silent expand** (only needed when `expandSubscriptions` is OFF): a temporary
  `<style id="ylh-guide-silent-expand">` hides `#expanded` while the list is
  expanded. Hiding it alone drops the 「もっと見る」 row and the sidebar visibly
  shrinks ~40px, so the same style also forces
  `[expanded] #expander-item{display:block}` — with both rules `#items` height
  measured identical (360px) before/during/after the dance.
- **Layout is a reconcile, not an append.** A snapshot of YouTube's original order
  (`header`, shown entries, hidden entries) is taken once; every pass computes the
  desired child lists (live first, in YouTube's own order, then the rest) and only
  moves elements that are out of place. That makes the pass a no-op when nothing
  changed (no MutationObserver feedback loop) and makes "a stream ended" restore
  that channel to its original slot inside `#expandable-items`.
- **Staying current**: `MutationObserver` on `#items` (childList+subtree,
  500ms debounce) catches live badges appearing/disappearing and YouTube
  re-rendering the guide; `yt-navigate-finish` is a cheap extra safety net (the
  guide element itself survives SPA navigation, so it is usually a no-op). The
  snapshot is re-taken whenever an entry it doesn't know about shows up.
- Settings gating follows the 2.6.1 lesson: `settings` stays `null` until the
  `chrome.storage.local` callback fires, so an OFF setting is never ignored on a
  fresh load. Turning `expandSubscriptions` OFF in the popup collapses the list
  immediately (and re-applies the sort afterwards, since collapsing re-stamps).
- Known rough edge, accepted: with `expandSubscriptions` ON, collapsing the list
  by hand is undone on the next observer pass ("always expanded" means always).
  Turn the toggle off to collapse it.

### Quality auto-set — `quality-bridge.js` (ISOLATED) + `quality-inject.js` (MAIN)

The only pair in this repo that needs the MAIN/ISOLATED bridge (see the world
gotcha below): `chrome.storage` is reachable only from ISOLATED, the player's
`getAvailableQualityLevels()` / `setPlaybackQualityRange()` only from MAIN. They
share `document`, so they talk over plain `CustomEvent`s — no messaging library.

- Both entries match `https://www.youtube.com/*` at `document_start`, top frame
  only (no `all_frames`), so they also load in the `live_chat` frame's own tab
  if it is ever opened directly — harmless, there is no `.html5-video-player`
  there.
- `quality-bridge.js`: reads `{autoQuality, defaultQuality, useMaxQuality}` from
  `chrome.storage.local` and dispatches `ylh:quality-settings` on load, on
  `storage.onChanged` (filtered to those three keys), and on `ylh:quality-request`
  — the last one covers the race where `quality-inject.js` starts before the
  bridge's first broadcast.
- `quality-inject.js`: **`settings` starts as `null` and every apply pass bails
  until the first `ylh:quality-settings` arrives.** This is the same lesson as
  the 2.6.1 `jumpToLive` bug — running with a baked-in default would force
  quality once per page load even with the feature OFF. Don't re-add a `DEFAULTS`
  object here; defaults live in `quality-bridge.js` and `popup.js` only.
- Apply pass walks `document.querySelectorAll('.html5-video-player')` (covers
  watch pages *and* Shorts) and calls `setPlaybackQualityRange(target, target)` —
  the same value twice pins one quality instead of a range. Everything is in
  `try/catch` and fails silently; these are unofficial APIs.
- Target selection: `useMaxQuality` → `available[0]`; else `defaultQuality` if
  present in `available`, else `available[0]` (a video whose max is below the
  configured default). Quality strings, best→worst: `highres` (8K), `hd2160`,
  `hd1440`, `hd1080`, `hd720`, `large` (480p), `medium` (360p), `small` (240p),
  `tiny` (144p), then `auto`.
- Re-runs on `yt-navigate-finish` plus a 1500ms `setInterval` fallback (quality
  list not ready, ad transitions, missed events). The interval is started when
  `autoQuality` is ON and `clearInterval`'d when it's toggled OFF, so an OFF
  setting costs nothing.

## Backlog / future work

- _(none open right now)_ — the poll-hide request was implemented as the
  `hidePolls` feature; see "Poll hide" under How it works now. Note the real
  poll tag turned out to be `yt-live-chat-poll-renderer` (not the guessed
  `yt-live-chat-banner-poll-renderer`), and its container moves between
  `#action-panel` and the banner manager depending on chat view mode.

## Removed: live elapsed-time display (`elapsed.js`)

A second feature was built and then removed at the user's request: a MAIN-world
`elapsed.js` that inserted a live-updating "（開始からhh:mm:ss経過）" span next
to the "◯時間前にライブ配信開始" date in the description. It worked in
end-to-end tests but the user found the flicker not fully suppressible, the
readout hard to read, and it failed to appear on some videos — so the whole
feature (the script, its `world: "MAIN"` content-script entry, and the docs)
was dropped. **If re-attempting**, the notes below are what was learned;
budget for the flicker/reliability problems being real, not just polish.

- Exact stream start came from
  `player.getPlayerResponse().microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp`
  (ISO string), fallback `window.ytInitialPlayerResponse` same path;
  elapsed = `Date.now() - new Date(startTimestamp)`. `player.getDuration()`
  is **not** usable for this — during a live broadcast it returns ~1h more
  than the real elapsed time (appears to include the DVR window).
- Insert-beside beat overwrite-in-place: overwriting the date element's
  `textContent` fought YouTube's re-render loop and flickered between our text
  and the original ~1×/s. Inserting our own `<span id="ylh-elapsed">` after
  the anchor (re-positioned every tick when `anchor.nextElementSibling !==
  el`) was better but still had a residual ~1s blip at each re-render, plus
  the "not appearing on some videos" issue — which is why it was ultimately
  cut.

### The MAIN vs ISOLATED world gotcha (keep this lesson even though elapsed.js is gone)

The player's methods (`getPlayerResponse`, `getCurrentTime`,
`seekToLiveHead`, …) and page globals (`ytInitialPlayerResponse`) are
attached by YouTube's own page scripts, which run in the **MAIN** world. A
default content script runs in the **ISOLATED** world: it shares the DOM, so
`document.getElementById('movie_player')` returns the element and DOM clicks
work, but the element's YouTube-added methods are **invisible**
(`typeof player.getPlayerResponse === 'function'` is `false`). Any future
feature that needs to *call* a player method (not just click DOM) must run in
a `world: "MAIN"` content script — `quality-inject.js` is the in-repo example
of doing it right (MAIN script + ISOLATED bridge over `CustomEvent`s).

Debugging trap that cost time here: Puppeteer's `page.evaluate()` runs in the
MAIN world by default, so a standalone `evaluate` reading `getCurrentTime()`
*succeeds* and makes the approach look viable — while the same call from the
ISOLATED content script silently returns nothing. Always confirm which world
a call needs before assuming an `evaluate` result reflects what a content
script will see. (Same MAIN/ISOLATED concern the quality feature solves with
its `CustomEvent` bridge.)

## Scope / known limitations

- No automated tests. Manual check: open a live YouTube stream, seek
  backwards, then navigate to another live video via a YouTube link — it
  should land at the live edge automatically, the chat should switch from
  "トップチャット" to "チャット" on its own, and any creator-pinned message
  banner or in-chat poll should stay hidden. For quality, use a video actually
  encoded above 1080p (otherwise "default 1080p" and "max quality" are
  indistinguishable) — known-good 4K test video: Big Buck Bunny 4K60,
  `https://www.youtube.com/watch?v=aqz-KE-bpKQ` — and read back
  `document.querySelector('.html5-video-player').getPlaybackQuality()`. Check a
  Shorts URL too, since that path is unique to this feature.
- **E2E.** Use the shared **`browser-testing`** skill (Playwright + Brave
  Browser Nightly; its Recipe B loads the unpacked extension). The quality
  feature was verified this way at merge time (2026-08-29), all green: extension
  loads with no errors; on Big Buck Bunny 4K the default run pins `hd1080`;
  toggling `常に最高画質` in the real popup switches the already-open tab to
  `hd2160` **without a reload** (proves storage.onChanged → CustomEvent →
  MAIN-world path); with `autoQuality` OFF a fresh load is left alone (landed on
  YouTube's own `hd1440`); a `/shorts/` page reaches the player API; and the
  2.6.1 regression guard still holds (zero synthetic `.ytp-live-badge` clicks on
  a VOD). The live-only features (seek, chat) were *not* re-tested — they need a
  real live stream and none of their code changed. Project-specific
  bits: the live chat is a same-origin subframe, so grab it with
  `page.frames().find(f => f.url().includes('live_chat'))` and `evaluate` inside
  *that frame*. The chat features were verified this way with the extension
  loaded (style injected, pinned banner `display:none`, manager height 0, and
  `allChat` switched to "チャット" in the same run). An older Puppeteer +
  Chrome-for-Testing recipe from the `yt-auto-quality-lite` skill also works.
- `#guide` entry internals (`.guide-entry-badge svg`, `#expander-item` /
  `#collapser-item` / `#expandable-items`, the `/feed/subscriptions` header link),
  `seekToLiveHead()`/`.ytp-live-badge`/`.ytp-time-display.ytp-live` (player), `#view-selector` +
  `tp-yt-paper-listbox` (chat mode dropdown),
  `yt-live-chat-banner-renderer` / `yt-live-chat-banner-manager` (pinned banner),
  `yt-live-chat-poll-renderer` / `#action-panel` (poll), and
  `getAvailableQualityLevels()` / `setPlaybackQualityRange()` (quality) are all
  unofficial/internal YouTube surfaces — fragile to YouTube UI changes, no
  official replacement exists. For quality specifically there is provably no
  official alternative (the Data API has no player control; the IFrame API can't
  attach to youtube.com's own player) — see the `yt-auto-quality-lite` skill for
  that research before anyone re-proposes an "official" fix. The pinned/poll-hide CSS relies on `:has()` (fine in current
  Chromium/Brave; `CSS.supports('selector(:has(*))')` was true).
- Old `chrome.storage.local` keys from v1 (`apiKey`, `topicChannels`,
  `channels`, `currentIndex`, `autoHop`, `lastQuery`) are simply orphaned on
  upgrade, not migrated or cleared — harmless unused data, not worth the
  added code to clean up for a personal WIP tool.
