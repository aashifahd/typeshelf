# Releasing Typeshelf

## How a release works

1. Pushing a tag like `v1.0.1` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which:
   - checks the tag matches `version` in `package.json`;
   - runs the typecheck, unit tests and licence check;
   - builds the installer with the Google Fonts API key;
   - uploads `Typeshelf-Setup-<version>.exe`, its `.blockmap` and `latest.yml` to a **draft** GitHub Release.
2. You test the installer from the draft, paste the notes from `CHANGELOG.md`, and click **Publish release**.
3. Installed copies of Typeshelf see the published release within 6 hours (or straight away via Settings → About → Check for app updates), download it in the background, and install it when the user clicks **Restart to update** or quits.

Drafts are invisible to the updater, so nothing reaches users until you publish.

## Steps

```bash
# 1. Update CHANGELOG.md: move "Unreleased" items under the new version.
# 2. Bump the version (no tag yet)
npm version patch --no-git-tag-version   # or minor / major
# 3. Commit and push, then wait for CI to pass on main
git commit -am "Release 1.0.1"
git push
# 4. Tag and push the tag
git tag v1.0.1
git push origin v1.0.1
```

Then on GitHub → **Releases**:
1. Open the draft.
2. Download the installer and run through the "Install" and "Everyday use" checks in [TESTING.md](TESTING.md).
3. Add the release notes and publish.

### If something is wrong

- **Before publishing:** delete the draft and the tag (`git push --delete origin v1.0.1`), fix, and tag again.
- **After publishing:** release a new patch version. Never replace files in a published release: installed apps check the file hashes in `latest.yml`.

## Requirements

- **Public repository.** electron-updater reads releases without a token, so self-updates only work once the repository is public.
- **Google Fonts API key:** the repository secret `GOOGLE_FONTS_API_KEY`.
- **Release notes:** `CHANGELOG.md`, following [Keep a Changelog](https://keepachangelog.com/).

## Code signing (SignPath Foundation)

[SignPath Foundation](https://signpath.org/) signs open-source projects for free, with a certificate issued to the SignPath Foundation. Signed installers stop most SmartScreen and antivirus warnings once they've built up download reputation.

**Before applying** (most of this happens in week 5, when the repository goes public):

1. **Repository:** make it public, with the GPL-3.0 licence (done) and at least one published release.
2. **MFA:** turn on two-factor authentication for every GitHub account with write access.
3. **Code signing policy:** add a "Code signing policy" section to the README (template below) and to the website page.
4. **Apply:** at signpath.org (Open Source → Apply). Describe Typeshelf, link the repository, the release workflow and the website. Check their current terms first; they change.

**After approval:**

1. **Store the token:** add the SignPath API token as the repository secret `SIGNPATH_API_TOKEN`, and note the organisation ID and project slug they give you.
2. **Add the signing step:** in `release.yml`, build the unsigned installer with `--publish never` and upload it as an artifact. Then submit it with [`signpath/github-action-submit-signing-request`](https://github.com/SignPath/github-action-submit-signing-request), wait for the signed file, and upload the signed installer plus a regenerated `latest.yml` to the draft release. SignPath's onboarding gives the exact configuration for the project.
3. **Check the result:** right-click the downloaded installer → Properties → Digital Signatures should show "SignPath Foundation".

### Code signing policy (README template)

> **Code signing policy**
>
> Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).
>
> - Committers and reviewers: [members of the repository](https://github.com/aashifahd/typeshelf/graphs/contributors)
> - Approvers: CenoDigital maintainers
>
> Only builds made by the release workflow from this repository are signed. Typeshelf doesn't send any information to networked systems unless you ask it to: see [Privacy](#privacy).

## Going public checklist (week 5)

**Repository:**
- [ ] Make the repository public (Settings → General → Danger zone → Change visibility).
- [ ] Turn on private vulnerability reporting, secret scanning and push protection (Settings → Code security). They're free for public repositories.
- [ ] Protect `main`: require the CI checks to pass before merging.
- [ ] Add a description, the website link and topics (`font-manager`, `fonts`, `windows`, `electron`, `google-fonts`).

**Release:**
- [ ] Tag `v1.0.0`, test the draft and publish it. The README's Download link then works.

**Signing and website:**
- [ ] Apply to SignPath Foundation.
- [ ] `cenodigital.com/typeshelf` is live with the download link and a working newsletter sign-up.
