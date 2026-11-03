#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?Run this script in GitHub Actions}"
gh auth setup-git --hostname github.com
repo="https://github.com/${GITHUB_REPOSITORY}.git"
if git ls-remote --exit-code --heads "$repo" gh-pages >/dev/null; then
    git clone --quiet --single-branch --branch gh-pages "$repo" published
else
    mkdir published
    git -C published init --quiet -b gh-pages
    git -C published remote add origin "$repo"
fi
mkdir -p published/pool
for artifact in build/dist/*.zip; do
    target="published/pool/$(basename "$artifact")"
    if [[ -f "$target" ]] && ! cmp -s "$artifact" "$target"; then
        echo 'A different artifact already exists at this version. Bump the manifest version.' >&2
        exit 1
    fi
    cp "$artifact" "$target"
done
npm run generate-index -- --dist published/pool \
    --base-url "https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/gh-pages/pool" \
    --out published/index.json
git -C published config user.name 'github-actions[bot]'
git -C published config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C published add pool index.json
if ! git -C published diff --cached --quiet; then
    git -C published commit -m 'Publish plugin repository'
    git -C published push origin gh-pages
fi
