// Season data lives in this repo, under public/vqar/data/. Each season is its
// own file, so adding one - or going back to edit an old one - never touches
// the others; the generated index.json lists where to find each and which one
// is currently being reviewed. Shared by public/vqar/app.js,
// public/vqar-stats/app.js, and src/schema.js, since they all read the same
// index. Scripts reach the files directly (see scripts/build-vqar-index.js).
export const VQAR_INDEX_PATH = '/vqar/data/index.json';
