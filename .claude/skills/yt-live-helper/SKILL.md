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

Nine features today, each with its own popup toggle (all stored in
`chrome.storage.local`; every toggle defaults `true` except `useMaxQuality` and
`autoNextLive`, which default `false`):

- **Live-head auto-seek** (`常に最新位置から再生`, key `jumpToLive`) — on opening
  a live watch page, seek the player to the live head. `live-bridge.js` +
  `live-inject.js`.
- **Hop to the next live on stream end** (popup section 「配信終了後の移動」, toggle
  `次のライブへ移動`, key `autoNextLive`, plus `autoNextLiveSkipHidden` — default
  **true**, the only `autoNextLive*` sub-setting that defaults ON) — when the stream you are watching ends, go to another live
  stream. **This is the only toggle that defaults `false`** besides
  `useMaxQuality` — it navigates for you, so the user asked for it to be opt-in.
  The destination is chosen by a **radio group, independent of the toggle**
  (key `autoNextLiveTarget`): `subscriptions` (default) = the topmost live channel
  in the sidebar's 登録チャンネル list, or `page` = open the URL in
  `autoNextLiveUrl` (default `''`) and enter the first live item listed there —
  meant for a game **topic channel's live grid**
  (`https://www.youtube.com/channel/<id>/live` — on a *topic* channel that URL is a
  grid of everyone streaming that game, not a single stream). Detection lives in `live-inject.js` (MAIN), destination + navigation
  in `guide.js`, joined by a `ylh:live-ended` CustomEvent. This is a deliberate,
  much smaller re-take on v1's removed auto-hop (see History) — no API key, no
  stored channel list, no background page; note the `page` mode brings back v1's
  "topic channel" idea, but as one user-supplied URL instead of a registry.
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
- **Live-icon direct link** (`ライブアイコンから配信へ直接移動`, key
  `liveChannelDirectLink`) — in the sidebar's 登録チャンネル list, make the red live
  icon a link straight to the stream, skipping the channel page. `guide.js`.
  Independent of `sortLiveChannels`; the channel-name half of the row still goes
  to the channel page.
- **Quality auto-set** (`画質を自動設定`, key `autoQuality`) — force playback
  quality to a configured default (key `defaultQuality`, `"hd1080"`) or to the
  best available (key `useMaxQuality`, default `false`, takes priority).
  `quality-bridge.js` + `quality-inject.js`. **Like `guide.js`, and unlike the
  live/chat features, this runs on all of `https://www.youtube.com/*`**
  (VODs and Shorts included), not just live pages — absorbed from the standalone `yt-auto-quality-lite` extension
  (see below).

The popup is split into **four** `.section` blocks with small headings —
「ライブ配信」(four live features),「配信終了後の移動」(the stream-end hop),
「サイドバー（登録チャンネル）」(the three guide features) and
「画質（通常動画・Shorts含む）」— the heading on the quality block is what tells the
user it isn't Live-only. The
quality block's two sub-rows (`常に最高画質を使う`, `デフォルト画質`) live in
`#qualityFields`, dimmed + `pointer-events:none` via `.sub-rows.disabled` when
`autoQuality` is OFF; the `<select>` is additionally `disabled` when
`useMaxQuality` is ON, since the default quality is unused then.

The hop got **its own section** at the user's request once its settings outgrew a
single row in 「ライブ配信」 (they were adding another feature to it next). Inside
it: the master toggle, labelled just 「次のライブへ移動」 since the section heading
already says 配信終了後 (same shape as the quality block — heading = domain, first
row = master toggle), then `#autoNextLiveFields` (a `.sub-rows`) holding a
`.sub-title` 「移動先」, the destination radio group, the URL `<input>`, and the
「非表示の配信を除外」 toggle with a `.row-note` one-liner under it. The whole block
dims when `autoNextLive` is OFF; the URL input is `disabled` and the skip toggle +
its note get `.row-disabled` (dim + `pointer-events:none`) unless the `page` radio
is selected, since neither means anything in `subscriptions` mode. Element ids and storage keys were left alone by that
move — only the markup's position and the label text changed. **The `<select>` pitfall below
applies verbatim to radios** — with no `checked` attribute none is selected, so
`popup.js` sets `radio.checked` unconditionally from
`stored.autoNextLiveTarget ?? 'subscriptions'`. The URL input saves on `input`
(not `change`): closing the popup can swallow a pending `change`.

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
version — verify against current `manifest.json`/`live-inject.js` before trusting
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

Six content-script entries (two live-seek, one chat, one guide, two quality), no
`background.js`, no `host_permissions`. Only the `storage` permission.

### Live-head auto-seek — `live-bridge.js` (ISOLATED) + `live-inject.js` (MAIN)

Both injected on `https://www.youtube.com/watch*`,
`https://www.youtube.com/live/*` and `https://www.youtube.com/*/live*` at
`document_start`, top frame only. That third pattern covers
`/@handle/live` and `/channel/<id>/live` — a live stream opened that way keeps
the channel URL rather than redirecting to `/watch?v=`, so before 2.9.0 the seek
simply never ran there (measured: `ylh:live-request` went unanswered while the
quality pair, matching all of `youtube.com/*`, worked fine). `CHANNEL_LIVE_RE`
in `live-inject.js` recognises the form, and since those URLs carry **no video
ID**, `getVideoId()` falls back to `location.pathname` as the dedup key. This
matters more now that the live-icon link in `guide.js` points at exactly these
URLs. This is the
**second MAIN/ISOLATED bridge pair** in the repo (the quality pair is the other).
Through 2.8.0 it was a single ISOLATED `content.js` that clicked
`.ytp-live-badge` — see "The 2.8.0 bug" below for why that never actually
performed a seek.

- `live-bridge.js` reads `jumpToLive` from `chrome.storage.local` and dispatches
  `ylh:live-settings` on load, on `storage.onChanged`, and on `ylh:live-request`
  (covers the race where `live-inject.js` starts before the bridge's first
  broadcast). Same shape as `quality-bridge.js`.
- `live-inject.js` keeps `settings = null` until the first `ylh:live-settings`
  arrives and bails until then — the 2.6.1 lesson (a baked-in `true` default
  seeks once per load even with the feature OFF). Don't add a `DEFAULTS` object
  here; defaults live in `live-bridge.js` and `popup.js` only.
  `handleNavigation()` runs on *every* settings event (dedup'd by video ID, so
  no double run), which also means flipping the toggle ON while already sitting
  on a live page takes effect immediately.
- Navigation detection is unchanged from the old `content.js`:
  `yt-navigate-finish` plus the initial run, dedup'd by video ID (`?v=` on
  `/watch`, path segment on `/live/<id>`). A new navigation bumps `runToken`,
  which cancels the previous seek loop.
- Live detection is still `document.querySelector('.ytp-time-display.ytp-live')`.
  **Do NOT use the presence of `.ytp-live-badge` as the live test** (2.6.1 bug).
- The seek loop polls every 300ms for up to **30s** and only acts when all three
  hold: the live class is present, `getPlayerState() === 1` (playing), and
  `getProgressState().isAtLiveHead === false`. It then calls
  `player.seekToLiveHead()` and **verifies on the next tick**, retrying until
  `isAtLiveHead` is true or the budget runs out.
  - The `getPlayerState() === 1` gate is load-bearing: right after load the
    player reports `isAtLiveHead: true` while `current` is still `0` and it is
    buffering (measured — `t=565ms: {cur:0, head:true}`, `t=1174ms: {cur:11499}`),
    so finishing on the first `true` would declare success before playback has
    settled.
  - 30s (was 15s) covers a pre-roll ad, during which `.ytp-time-display.ytp-live`
    is absent so the loop simply waits.
  - Because the loop stops as soon as the live head is confirmed **once**,
    seeking backwards by hand afterwards is never undone. Periodic drift
    correction ("always snap back to live") was explicitly offered to the user
    and **declined** — don't add it without asking again.
- **Stream-end detection (2.10.0)** also lives here, as a plain 1s `setInterval`
  (an end can happen at any moment; there is no event for it). It fires
  `ylh:live-ended` only when **both** hold: the page is known to be a live stream,
  and `getPlayerState() === 0` (ENDED) on **two consecutive ticks** (an ad
  transition could flash ENDED once). "Known to be a live stream" is
  `.ytp-time-display.ytp-live` **or** `getPlayerResponse().videoDetails.isLive`;
  the latter is true from load, so detection does not depend on having caught the
  live class, and it is *absent* on an archive opened after the stream ended
  (measured: an ended stream keeps `isLiveContent: true` but loses `isLive`, and
  gains `microformat…liveBroadcastDetails.endTimestamp` with
  `isLiveNow: false`) — so a normal video can never trigger the hop. `isLiveNow`
  is page-load data and does **not** flip when the stream you are watching ends;
  only the player state does.
- `handleNavigation()` keeps **two** video-id fields: `lastVideoId` (updated on
  every navigation regardless of `jumpToLive`, used to reset the end-watch state)
  and `seekedVideoId` (the seek's own dedup key). Collapsing them back into one
  would break the documented "flip the toggle ON while sitting on a live page and
  it takes effect immediately" behaviour.
- **`.ytp-live-badge` is no longer clicked at all**, which removes the 2.6.1
  regression path structurally rather than by guard: `seekToLiveHead()` is a
  measured no-op on a VOD.

#### The 2.8.0 bug — the badge click never actually fired

Measured in the user's Chrome Dev on a real live stream (2026-09-22): across a
plain load, a reload, and an SPA back-navigation, a page-level capture listener
saw **zero** clicks on `.ytp-live-badge` over 17s. From ~565ms after load — i.e.
before the ISOLATED `content.js` even ran at `document_idle` — the badge is
already `disabled=true` with class `ytp-live-badge-is-livehead`, and
`element.click()` on a disabled button dispatches no event. The old code clicked
once on the first tick where it found the badge and then `return`ed, with no
verification and no retry, so that one swallowed click *was* the entire feature.
The companion `player.seekToLiveHead()` call was dead code (ISOLATED world).

Net: the feature had no working seek mechanism at all. It only *looked* fine
because YouTube usually starts a live watch page at the live head on its own —
verified here that plain loads, reloads and SPA navigations to a live video all
land at `isAtLiveHead: true` unaided.

Proof the rest of the wiring was fine: faking a navigation (`history.replaceState`
to a different `?v=` + dispatching `yt-navigate-finish`) *while the badge was
enabled* made the old extension emit a synthetic (`isTrusted:false`) click and
jump 10354s → 11555s. Handy probe technique if this feature ever needs debugging
again — it exercises the real content script without touching the extension.

**Corollary that supersedes the older note in the 2.6.1 section:** the badge's
`disabled` flag is not a usable signal in either direction — don't guard on it,
and don't click the badge. Use `getProgressState().isAtLiveHead`, which is
accurate once `getPlayerState()` reports playing.

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
    This is why the current implementation can call it without a VOD guard.
  - The badge appears in the DOM at ~800ms, *before* `readyState` reaches
    `interactive`/`complete`, i.e. before a `document_idle` content script runs.
  - Regression check for any future change here: with the extension loaded on a
    normal video, a page-level capture listener must observe **zero** synthetic
    (`isTrusted: false`) clicks on `.ytp-live-badge`, and playback must advance
    normally. See "E2E" below.

### Chat features — `chat.js` (all-view switch + pinned-message hide)

`chat.js` (ISOLATED world), injected on `https://www.youtube.com/live_chat*`
with **`all_frames: true`** — the live chat is a *same-origin iframe*
(`#chatframe`, src `…/live_chat?…`) nested in the watch page, and content
scripts reach subframes only when `all_frames` is set. This is a **separate
`content_scripts` entry** from the live pair (which matches only the top-frame
watch/live URLs), so they never run in the chat frame and `chat.js`
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

### Sidebar guide — `guide.js` (live sort + auto-expand + live-icon direct link)

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
- **Live detection is the badge's computed `display`** —
  `getComputedStyle(entry.querySelector('.guide-entry-badge')).display !== 'none'`.
  Measured on all three states (matches the Polymer `data.badges.liveBroadcasting`
  exactly):

  | | `.guide-entry-badge` | badge `display` | badge has `svg` (visible tab) | `#newness-dot` |
  |---|---|---|---|---|
  | live | present | `block` | yes | `none` |
  | new content (blue dot) | present | `none` | no | `block` |
  | nothing | present | `none` | no | `none` |

  So the badge *element* exists on every entry — same trap as the 2.6.1
  `.ytp-live-badge` bug; presence is not the test. `aria-label` does say
  「ライブ配信中。」 but is language dependent, and `entry.data.badges` is
  Polymer state, invisible from ISOLATED.
- **Do NOT use `.guide-entry-badge svg` as the live test** (this was the test
  through 2.9.0). Measured 2026-09-23 in the user's Chrome Dev: while the tab is
  **hidden**, Polymer never upgrades the icon — a live entry's `yt-icon` keeps
  `disable-upgrade` and is empty inside — so `svg` is missing on *every* entry and
  the guide looks like it has **zero** live channels. The badge's `display` is
  correct in hidden tabs (verified: 9 entries `block`, exactly matching the 9 with
  an 「ライブ配信中。」 `aria-label`), so the display test is the only one that
  works in both states. `getComputedStyle` also reads correctly while the guide
  drawer is *closed* (computed `display` is unaffected by a `display:none`
  ancestor) — which the stream-end hop relies on.
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
- **Live-icon direct link** (`liveChannelDirectLink`, added 2.9.0). The red live
  icon (`yt-icon.guide-entry-badge`, 16×16, inside `a#endpoint`) gets a
  `data-ylh-live-link` attribute holding the entry's channel href + `/live`, plus
  a `title`. A single delegated capture-phase `click`/`auxclick` listener on
  `document` (installed unconditionally at script start — it no-ops when nothing
  carries the attribute) intercepts clicks on it. Measured facts behind that
  design:
  - **Rewriting `href` alone does nothing.** The row is an `a.yt-simple-endpoint`
    and YouTube's SPA router navigates from the Polymer `data` property
    (a `browseEndpoint`), not from `href` — setting `href="/@x/live"` and clicking
    still landed on `/@x`. And `a.data` is a MAIN-world property, invisible from
    `guide.js`'s ISOLATED world, so it can't be rewritten either.
  - **Capture-phase `preventDefault()` + `stopPropagation()` does reliably block
    the SPA handler** (verified: page stayed put).
  - **`<channel>/live` is a real watch page, not a redirect.** `/@nepiaaaaa/live`
    stays at that URL with a live player at the live head — that's why
    `live-inject.js` had to learn the form (see its section).
  - **`/live` is undocumented.** It is a youtube.com URL convention, not an API
    and not a documented feature: YouTube's own "Understand your YouTube
    channel's URLs" help page lists only `/channel/<id>`, `/@handle`, `/c/<name>`
    and `/user/<name>`, and neither it nor the live-stream settings page mentions
    a `/live` suffix (checked 2026-09-22). Creators pass it around in the help
    forums as a "permanent live link". The official alternative — Data API v3
    `search.list` with `channelId` + `eventType=live` — costs 100 quota units per
    call and would resurrect the API-key handling that v2 deliberately removed,
    so it is not a realistic substitute here.
  - **The failure mode is benign**, which is why the undocumented dependency is
    acceptable. On a channel that is *not* live, `<channel>/live` simply
    redirects to the channel page (measured: `/@youtubecreators/live` →
    `/channel/UCkRfArvrzheW2E7b6SVT7vQ`, no live player). So a stale mark — the
    stream ended between the guide render and the click — lands the user exactly
    where the unmodified sidebar would have, and if YouTube ever drops `/live`
    entirely the feature degrades to pre-2.9.0 behaviour rather than breaking.
  - Note the extension **never resolves the video ID itself** — no fetch, no
    innertube call, no stored state; the server-side redirect does the work.
    Resolving it client-side was considered and rejected (scraping each live
    channel's `/live` HTML for `ytInitialData` means pulling ~1MB per live
    channel on every guide re-render).
  - No SPA route exists for it: dispatching `yt-navigate` with a hand-built
    endpoint did nothing, so the click does `location.assign()` — a full page
    load. The user was asked and accepted this (it replaces two SPA navigations
    with one load).
  - The badge can't become a real `<a>` (it lives *inside* one), so modified and
    middle clicks use `window.open(url, '_blank')`, which Chrome opens in the
    **foreground** — unlike a native ⌘-click's background tab. Known deviation,
    the user was told; an absolutely-positioned overlay `<a>` appended to the
    `ytd-guide-entry-renderer` is the escape hatch if this ever needs fixing, at
    the cost of hardcoding YouTube's row padding.
  - Hit area is widened from 16px to ~28px by a `::after` with `inset:-6px` (the
    badge is already `position:relative`); clicks on it hit-test to the badge.
    Hover feedback is `transform:scale(1.25)` — a translucent background circle
    would paint over the icon, since `::after` stacks above it.
  - Marking happens inside `layout()` against `all.filter(isLive)` computed
    **before** the `sortLiveChannels` gate, so the two features are independent.
    Attribute writes don't retrigger the `MutationObserver` (it watches
    `childList` + `subtree` only, not `attributes`).
- **Stream-end hop** (`autoNextLive`, added 2.10.0). `guide.js` listens for
  `ylh:live-ended` from `live-inject.js` and navigates to the first live entry's
  `<channel>/live` URL — the same URL form the live-icon link uses. Measured facts
  behind the design:
  - **A watch page has no guide at all.** `ytd-guide-renderer` does not exist
    there (only `ytd-mini-guide-renderer`); the subscription list cannot be read
    without opening the drawer. Clicking `#guide-button button` creates it, and
    that click makes YouTube **POST `/youtubei/v1/guide`** (verified in the
    network log) — so even a page that has been open for hours gets *fresh* live
    state at the moment of the hop. The drawer is hidden during this by a
    temporary `<style id="ylh-guide-hop">` setting `opacity:0` +
    `pointer-events:none` on `tp-yt-app-drawer#guide` (opacity, not `display`, so
    the list still renders). On success the style is deliberately **left in
    place** — the page is navigating away and removing it would flash the drawer.
  - The hop reuses `apply()` for the expand + sort dance, so the 「もっと見る」
    entries are materialized first; most of the user's live channels are hidden
    there. Timing measured end to end: entries present ~320ms after the click,
    navigation ~1.8s after the end was detected.
  - Target = **first live entry in `[...shown, ...hidden]` DOM order**, which is
    YouTube's own order whether or not `sortLiveChannels` lifted anything, so the
    two features stay independent.
  - The **current channel is excluded** (compare the watch page's
    `ytd-video-owner-renderer a.yt-simple-endpoint` href, or the handle in a
    `<channel>/live` path, decoded + lowercased): right after a stream ends its
    guide entry can still show as live.
  - No live channel → **do nothing and stay put** (no fallback to the home or
    subscriptions feed; that was a deliberate choice).
  - The hop materializes 「もっと見る」 **itself** (`expand()` + `SETTLE_MS`) when the
    hidden entries are not in the DOM yet, instead of relying on `apply()`: both
    sidebar toggles can be OFF, and then `prepareList()` deliberately does nothing —
    which would leave most of the user's live channels invisible to the hop. If the
    hop expanded the list and then does *not* navigate, it collapses it again unless
    `expandSubscriptions` is ON.
  - Autoplay is not suppressed. If YouTube's own "next video" autoplay wins the
    race, the hop simply lands afterwards; each wait inside the hop has an 8s budget.
- **`page` mode is two navigations**, because what a list page contains can only be
  learned by opening it. `hopToNextLive()` writes a `sessionStorage` mark
  (`ylh:pick-live`, a timestamp; tab-scoped, so two tabs can't cross wires) and
  `location.assign()`s the configured URL; the fresh `guide.js` on the destination
  reads *and immediately clears* the mark (ignoring it if older than 60s) and then
  picks the first live item. The mark alone authorizes the pick — only this extension
  can have written it — but since 「非表示の配信を除外」 became a setting,
  `pickLiveOnThisPage()` now `await`s `settingsLoaded` (a promise resolved from the
  same `chrome.storage.local.get` callback that fills `settings`) before it starts,
  and reads `settings.autoNextLiveSkipHidden` once.
  - Live items are found via `badge-shape.ytBadgeShapeLive` (new UI) or
    `ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]` (older
    shelves) — class/attribute, never the 「ライブ」 text. Measured on the topic
    channel's live grid: 46/46 `ytd-grid-video-renderer` items carry
    `badge-shape.ytBadgeShapeLive`.
  - Item renderers differ per page type (`ytd-grid-video-renderer`,
    `ytd-rich-item-renderer`, `yt-lockup-view-model`, …), so instead of listing them
    the code walks **up from the badge** (≤8 levels) to the first ancestor that
    contains an `a[href*="/watch?v="]`. Verified this returns the first grid item's
    own href on the topic page.
  - If a **displayed** `#movie_player` exists on arrival, the configured URL *was* a
    stream (a normal channel's `/live`) — stop there. The URL alone can't tell them
    apart, since a topic channel's `/channel/<id>/live` is a **grid**, not a watch page.
    **Presence is not the test** (measured 2026-09-23 on the user's topic-channel grid):
    the grid page grows a `#movie_player` of its own ~1.1s after landing, inside a
    `display:none` `ytd-watch-flexy` in the SPA page-manager — so the pre-fix
    existence check would abort the hop on any load where the badges resolved slower
    than that. `checkVisibility()` separates them cleanly: `false` on the grid's hidden
    player, `true` from ~400ms on a real watch page.
  - **Items hidden by another extension are skipped** when
    `autoNextLiveSkipHidden` is ON (default; popup toggle 「非表示の配信を除外」, dimmed
    via `.row-disabled` when the `subscriptions` radio is selected, since it only
    applies to `page` mode). OFF restores the pre-toggle behaviour exactly: no
    visibility test **and no settle wait** — it opens the first badge it finds. The
    user asked for the switch knowing the detection only covers one hiding technique;
    matching each filter extension's internals was explicitly out of scope. Mechanics
    (`isDisplayed()` /
    `Element.checkVisibility()`, Chrome 111+ = `minimum_chrome_version`). The user runs
    **YT Quick Filter**, which sets `display:none` on the whole
    `ytd-grid-video-renderer`; `checkVisibility()` on the badge sees an ancestor's
    `display:none`, so it works whatever level the filter hides — but *only*
    `display:none`: an extension that removes the node, zeroes its size or makes it
    transparent is invisible to this test, by design. Verified on the live
    grid: 50 live badges, 19 filtered out, and with the top item additionally hidden the
    pick moved from index 0 to index 2 (skipping the filtered index 1). Hiding *every*
    item yields `null` → stay put, which is deliberate: navigating to a channel the user
    filtered out is worse than not hopping.
  - **The filter applies in waves** (measured: 5 items hidden at ~0.6s after landing,
    19 at ~2.7s), so the first visible candidate can disappear right after it is picked.
    `settledLiveHref()` therefore re-reads every 400ms until two consecutive reads agree
    (cap 3s, then use the last read) — ~400ms of added latency when nothing changes.
    Only `page` mode does this; the sidebar list is not filtered by that extension.
  - **Lazy-render trap (measured):** `/feed/subscriptions` renders *nothing* in a
    hidden tab (`ytd-rich-grid-renderer` present, 0 items, 0 watch links), while the
    topic channel's older shelf grid renders fully. So the pick falls back to waiting
    for `visibilitychange` (capped at 5 min) and retrying once.
  - Only `youtube.com` URLs are accepted (`normalizeTargetUrl`, `new URL(value,
    'https://www.youtube.com')` so a bare path works) — the extension must never
    navigate the user to an arbitrary site typed into the popup.
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
a `world: "MAIN"` content script — `quality-inject.js` and `live-inject.js` are
the in-repo examples of doing it right (MAIN script + ISOLATED bridge over
`CustomEvent`s). The 2.8.0 bug below is what happens when you skip that step.

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
  a VOD). Project-specific
  bits: the live chat is a same-origin subframe, so grab it with
  `page.frames().find(f => f.url().includes('live_chat'))` and `evaluate` inside
  *that frame*. The chat features were verified this way with the extension
  loaded (style injected, pinned banner `display:none`, manager height 0, and
  `allChat` switched to "チャット" in the same run). An older Puppeteer +
  Chrome-for-Testing recipe from the `yt-auto-quality-lite` skill also works.
  The live-head seek needs a **real live stream**, which Playwright/Brave can't
  supply on demand — the MAIN-world rewrite was instead verified against the user's
  own Chrome Dev over the Claude-in-Chrome extension, on a stream the user was
  watching. All green: bridge answers `ylh:live-request` with `{jumpToLive:true}`;
  a 20-minute manual seek-back followed by a navigation snapped back to the live
  head within 400ms (10840s → 12042s) with **zero** badge clicks; with
  `{jumpToLive:false}` pushed to `live-inject.js` the same sequence stayed 20
  minutes behind; a plain load ends at `isAtLiveHead: true`; Big Buck Bunny
  advanced 0→15s untouched with zero badge clicks; no console errors. Two tricks
  that make this testable without a live stream of your own: fake an SPA
  navigation with `history.replaceState` to a different `?v=` + a
  `yt-navigate-finish` dispatch, and drive the OFF path by dispatching
  `ylh:live-settings` directly (then `ylh:live-request` to restore the real
  value). Remember `video.currentTime` is the **media** timeline on a DASH live
  stream and says nothing about how far behind you are — use
  `getProgressState()`.
  The 2.10.0 stream-end hop was verified in Chrome Dev without waiting for a real
  stream to end, by faking the two signals the detector reads: add the `ytp-live`
  class to `.ytp-time-display` and override `player.getPlayerState = () => 0` from
  the MAIN world (`javascript_tool` runs there). All green: the tab hopped from an
  ended stream to the top live channel's `<channel>/live` ~1.8s later, landing on a
  page with `isLiveNow: true` at the live head with 0s delay (the seek feature
  working on the `/live` form), no leftover `ylh-guide-hop` style, drawer closed, no
  console errors. Regression guards, both green: forcing only `getPlayerState` to
  ENDED on the *archive* page (no live class, no `isLive`) did nothing, and the same
  on Big Buck Bunny — no navigation, no drawer opened, no style injected.
  The filter-aware `page`-mode pick was verified the same way (2026-09-23, both the
  extension and **YT Quick Filter** loaded in the user's Chrome Dev, target =
  the スプラトゥーン3 topic channel's live grid). All green: writing the
  `ylh:pick-live` mark by hand and reloading the grid landed on the first *visible*
  live item's watch page with the mark consumed; faking the stream end on that page
  (`player.getPlayerState = () => 0` from the MAIN world) ran the whole two-stage hop
  — `document.referrer` on the destination was the grid URL, proving it went through
  the list rather than reloading; the same fake on Big Buck Bunny navigated nowhere.
  No `ylh` console errors (only YouTube's own `scheduler.js` exception at teardown).
  Handy trick: **`sessionStorage['ylh:pick-live'] = Date.now()` + `location.reload()`
  exercises `pickLiveOnThisPage()` on demand**, with no stream end and no waiting.
  What this route can *not* show is the skip itself when the top item happens to be
  visible — pre-hiding an item does not survive the reload, so that half was measured
  by running the identical algorithm in-page (see the `page` mode notes above).
  The 2.9.0 live-icon link was verified the same way (Chrome Dev, 9–10 channels
  actually live): 9/9 badges marked with the right `/@handle/live` URLs; a real
  click on the icon landed on `/@nepiaaaaa/live` with `ylh:live-request` now
  answered there; a click on the channel name still SPA-navigated to `/@handle`;
  toggling the popup switch OFF removed every attribute, the `title` and the
  injected style with the sort left intact, and ON re-marked without a reload.
  **Trap when testing the guide:** in a hidden tab YouTube never stamps the live
  icon's `svg`, so any test that counts `.guide-entry-badge svg` reports
  `liveEntries: 0` and looks like a regression — check `document.visibilityState`,
  and count `getComputedStyle(badge).display !== 'none'` instead (what the code
  itself does since 2.10.0). Tabs driven by the Claude-in-Chrome extension are
  `hidden` unless they happen to be the active tab, so this bites constantly. Also scope the section lookup
  by the `/feed/subscriptions` header link; a bare
  `ytd-guide-section-renderer #items` grabs the ホーム/ショート section.
- `#guide` entry internals (`.guide-entry-badge` + its computed `display`,
  `a#endpoint.yt-simple-endpoint`
  and its Polymer `data` endpoint, `#expander-item` /
  `#collapser-item` / `#expandable-items`, the `/feed/subscriptions` header link),
  `seekToLiveHead()`/`getProgressState()`/`getPlayerState()`/`.ytp-time-display.ytp-live` (player), `#view-selector` +
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
