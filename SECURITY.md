# Security policy

## Supported versions

Only the latest release of Typeshelf receives security fixes. The app updates itself, so most users are on
it within a day of a release.

## Reporting a vulnerability

Please **don't** open a public issue. Use GitHub's private reporting instead: on the repository, open the
**Security** tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and which version you tested. We aim to reply within 5
working days and to ship a fix for confirmed issues as soon as possible. We're happy to credit you in the
release notes.

## What's in scope

- The Typeshelf app and its installer.
- How the app downloads, validates and installs fonts, and how it changes the Windows font registry.
- The IPC boundary between the window and the main process, and the `tsfont://` protocol.

Fonts themselves, and the Google Fonts and Fontshare services, are out of scope; report those to their
owners.
