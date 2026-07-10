// Season data lives in gists, not this repo. Each season lives in its own
// separate gist too, so adding one - or editing an old one - never touches
// the others; the manifest just lists where to find each. Shared by
// public/vqar/app.js, src/schema.js, and scripts/validate-gists.js, since
// they all point at the same manifest gist.
export const MANIFEST_URL = 'https://gist.githubusercontent.com/pendelgeist/0b278faa556b5176f6e90324d5f5173b/raw/vqar-manifest.json';
