# Valenced plugins

JavaScript-only plugins for [Valenced](https://github.com/Valenced/Valenced) on sideloaded Discord for iOS.

| Plugin | What it does |
| --- | --- |
| [Message Logger for iOS](#message-logger-for-ios) | Saves deleted messages, edit history, and optionally attachments. |
| [Toad URL Cleaner](#toad-url-cleaner) | Removes tracking from links copied, sent, or edited in Discord. |
| [No Reply Mention](#no-reply-mention) | Turns off the automatic ping when replying. |
| [Silent Message Toggle](#silent-message-toggle) | Sends messages without notifications using a chat button. |
| [Hide Chat Buttons](#hide-chat-buttons) | Hides selected buttons from the chat bar. |
| [Read All Notifications (Toad)](#read-all-notifications-toad) | Marks unread server channels as read from the server list. |

## Install

1. Add this URL in Valenced's plugin repository settings:

   ```text
   https://raw.githubusercontent.com/thetoadsage/valenced-plugins/gh-pages/index.json
   ```

2. Open **Browse**, install the plugins you want, and enable them.

Disable any equivalent community plugin first to avoid overlapping hooks. Plugin ZIPs are also available as build artifacts, although some iOS builds hide the file installer. You do not need to rebuild Discord.

These plugins target **Discord 352.x** and **Valenced API 1.x** on iOS. They use private Discord APIs that can change between versions. No Reply Mention, Silent Message Toggle, Hide Chat Buttons and URL Cleaner have local integration coverage but have not been tested on a physical iPhone; Message Logger's device coverage is still limited.

## Message Logger for iOS

Keeps a searchable, per-account history of messages and attachments the plugin has seen. It can:

- Show deleted messages and earlier edits in chat, with configurable colors.
- Search saved history by text, author, channel, or date and filter deleted messages, edits, and direct ghost pings.
- Optionally download deleted attachments and open saved files with the iOS share sheet.
- Ignore selected users, channels, servers, bots, or your own messages.

Open the plugin's settings for **Saved history** and retention controls. Long-press a logged message for its history and other actions, or long-press a channel to clear its history.

**Show saved deletions in chat** and **Download deleted attachments** are off by default. Saved edit history can appear on matching loaded messages when **Show earlier versions in chat** is enabled. Restored deletions are labeled `[Saved deletion]`; rich embeds, replies, and reactions are not reconstructed. The logger cannot recover messages deleted before it received them, including while Discord was closed. Ghost-ping detection covers direct mentions, not role or everyone mentions.

History defaults to **30 days, 1,000 messages, and 5 MiB per account**, plus a recovery copy. Attachment downloads default to **5 MiB per file** and **25 MiB per account**. Limits can be changed in settings; lowering them and applying retention permanently removes excess history or files. Larger archives take more memory and time to save.

### Storage and privacy

History is stored locally as **unencrypted JSON**, separately for each account, in Discord's Documents folder. Attachments are ordinary files alongside a metadata index:

```text
Documents/valenced/messagelogger/
├── messages/<account-id>/archive.json
├── messages/<account-id>/archive.json.bak
└── attachments/<account-id>/
```

With document sharing enabled in the installed IPA, browse to **Files → On My iPhone → Discord/Valenced → valenced → messagelogger**. Files visibility requires the IPA's `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` settings; the plugin cannot enable them. Older plugin-storage archives are not imported or deleted.

There is no iCloud sync or automatic backup. Removing Discord or the plugin can remove its storage, and a force-close before a write finishes can lose recent changes. Retention and clear actions delete saved files; copy anything you want to keep outside the logger folder. Attachment links can expire, and interrupted downloads may need to be retried.

## Toad URL Cleaner

Cleans tracking parameters and supported redirects from links copied, sent, or edited **inside Discord**. Each action has its own switch and is enabled by default. Received messages and the system clipboard are unaffected.

**Shorten product and model links** is optional and off by default. It uses canonical links for Amazon, AliExpress, Best Buy, Walmart, and MakerWorld, discarding query options and fragments such as MakerWorld profile selection.

Disable the community **Clear URLs** plugin before enabling this one. Rules are bundled locally; URLs and messages are not stored or sent to a server. Opaque shorteners such as `t.co` and `bit.ly` are not resolved. Unusually formatted links and oversized inputs may pass through unchanged.

## No Reply Mention

Turns off the automatic mention when you reply. You can still use Discord's reply toggle to enable a ping for an individual reply. This does **not** silence a manually typed `@username` mention.

In settings, add comma- or space-separated user and role IDs to control exceptions. By default, only listed users and roles are pinged. Turn off **Only mention listed users and roles** to ping everyone except those listed. Role matching depends on Discord having the member's roles cached. Check the reply mention indicator before sending, especially when role data may be unavailable.

## Silent Message Toggle

Tap the bell in the chat bar to add Discord's `@silent` prefix to the next message. The toggle turns off after sending by default. Settings can keep it enabled after sending or when changing channels. Silent messages suppress notifications, but mentions remain visible in Discord.

## Hide Chat Buttons

Choose independently whether to hide the plus, gift, emoji, or voice-message microphone in the chat bar. All four remain visible by default. Hiding the plus also hides its attachment and actions menu. Optionally keep the remaining action buttons visible while typing. The Silent Message Toggle bell is unaffected. Reload Discord after changing these settings or disabling the plugin. Disable the community Better Chat Buttons plugin to avoid overlapping hooks.

## Read All Notifications (Toad)

Tap the checkmark below Direct Messages to mark unread server channels and joined threads as read. Disable the community **Read All Notifications** plugin and restart Discord before testing this version. This version bundles its checkmark image and still needs an iPhone check.

## Development

Use Node 26 and npm:

```sh
npm ci
npm run lint:types
npm run lint
npm test
npm run package
```

Packages are written to `build/dist`, with checksums in `build/SHA256SUMS`. The `gh-pages` branch hosts the repository index and versioned ZIPs; publishing refuses to replace an existing version with different bytes.

To refresh URL Cleaner's rules and reference corpus from a reviewed local [Clipboard Cleaner](https://github.com/thetoadsage/clipboard-cleaner) checkout on macOS, run `python3 scripts/sync-url-cleaner.py /path/to/clipboard-cleaner` and `npm test`. Review imported changes and bump the plugin version before publishing.

## Credits and license

Message Logger is adapted from [Valenced Community Plugins](https://github.com/Valenced/valenced-community-plugins/tree/main/plugins/message-logger), with [Vencord MessageLogger](https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLogger) as a behavior reference. No Reply Mention and Silent Message Toggle are based on their Vencord counterparts; the latter uses the [Silent Typing](https://github.com/Valenced/valenced-community-plugins/tree/main/plugins/silent-typing) mobile button integration. URL Cleaner uses [Clipboard Cleaner](https://github.com/thetoadsage/clipboard-cleaner) rules and Valenced Clear URLs as an integration reference. Build tooling comes from the [Valenced plugin template](https://github.com/Valenced/valenced-plugin-template).

GPL-3.0. See [LICENSE](LICENSE) and the notices for [Message Logger](NOTICE), [URL Cleaner](plugins/url-cleaner/NOTICE), [No Reply Mention](plugins/no-reply-mention/NOTICE), and [Silent Message Toggle](plugins/silent-message-toggle/NOTICE).
