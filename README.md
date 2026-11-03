# Valenced plugins

JavaScript-only plugins for Valenced on sideloaded Discord for iOS.

## Install

Add this repository URL in Valenced's plugin repository settings:

```
https://raw.githubusercontent.com/thetoadsage/valenced-plugins/gh-pages/index.json
```

Install **Message Logger for iOS** and enable it. Disable the original community Message Logger first to prevent overlapping message hooks.

You can also import the plugin ZIP from a GitHub Actions artifact through Valenced's file installer. This is a plugin ZIP, not an IPA. Your Discord app does not need rebuilding.

## Message Logger for iOS

Adapted from Valenced Community Plugins' mobile Message Logger, with Vencord MessageLogger behavior as a reference. It has no Android JAR, native dylib, jailbreak dependency or remote logging service.

- Retains deleted messages and removed attachments already present in Discord's cache.
- Shows earlier text versions inline and in a long-press message history alert.
- Marks retained messages with a `[Deleted]` label and a critical text color.
- Clears one message's history, a channel's history, or the whole session's history.
- Includes toggles for deletions, edits, removed attachments and inline history.
- Can ignore bots, your own messages, user IDs, channel/category IDs and server IDs.
- Clears in-memory history on logout/login and restores retained cache entries when disabled.

Open the plugin's settings for options and the current session log list. Long-press a logged message for **View message history**, **Toggle Deleted Highlight**, or **Remove History**. Long-press a channel to clear its log.

## Compatibility and limits

The initial target is Discord **352.0** with Valenced **1.3.0** on iOS. The manifest accepts Discord 352.x. The plugin is experimental: local integration tests and builds do not establish physical-device compatibility. Its private Discord UI hooks still need iPhone testing.

Logs are temporary and remain in memory. Reloading Discord discards them. It cannot recover messages deleted before the plugin received them, or fetch messages your account cannot access. Retained attachment links can expire or stop working. Attachments and avatars are not dimmed by Android-native hooks. Desktop CSS overlays and desktop collapsed-message styling are not included.

## Build

Use Node 26 and npm:

```
npm ci
npm run lint:types
npm run lint
npm test
npm run package
```

ZIPs are written to `build/dist`. The public `gh-pages` branch holds versioned packages and a generated, SHA-256-verified `index.json`. Publishing refuses to replace an existing version with different bytes.

## Credits and license

[Valenced Message Logger](https://github.com/Valenced/valenced-community-plugins/tree/main/plugins/message-logger) by Palm and contributors supplies the mobile foundation. [Vencord MessageLogger](https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLogger) by Vendicated and contributors supplies the desktop behavior reference. Build tooling comes from the [Valenced plugin template](https://github.com/Valenced/valenced-plugin-template).

GPL version 3. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
