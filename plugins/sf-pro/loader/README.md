# SF Pro for Valenced on iOS

The font pack replaces Discord’s gg sans styles with the iOS system font. It
uses UIKit at runtime and carries no Apple font files.

Build the companion Valenced iOS loader after applying
`system-ui-ios.patch` from the Valenced source root. The patch was prepared
against the Discord 353.0 r1 source at `01c165bd0bcd4a7078464ed75d12b0c2ca43ac45`.
The stock iOS loader treats the Themes API’s `system-ui` value as a file path.
This patch makes it resolve to a system font and preserves gg sans weights and
italics.

Install and enable the plugin on the patched IPA. In **Valenced → Themes →
Fonts**, select **SF Pro (toad)** for the sans font. Restart Discord to check
the selected font after a cold start. Select Discord’s default font to undo
the change.
