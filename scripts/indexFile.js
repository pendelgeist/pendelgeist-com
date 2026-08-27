import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared mechanics behind build-vqar-index.js and build-fsar-index.js. Both
 * generate an index.json from a directory of hand-edited JSON files, and both
 * do it the same way - only the shapes they read and write differ. The data
 * flows stay independent; it's the script plumbing that's common.
 */

/**
 * Reads every .json file in a directory, sorted by filename so a rebuild
 * produces a stable diff. These files are hand-edited, so a syntax error is a
 * routine outcome - the parse error gets the filename attached, since
 * "Unexpected token } in JSON at position 4021" on its own doesn't say which of
 * them to go and look at.
 * @param {string} dir
 * @returns {{ filename: string, data: object }[]}
 */
export function readJsonFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((filename) => {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
      try {
        return { filename, data: JSON.parse(raw) };
      } catch (error) {
        throw new Error(`${filename} is not valid JSON: ${error.message}`, { cause: error });
      }
    });
}

/** Indexes are committed, so they're written pretty-printed with a trailing newline. */
export function serializeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/**
 * Either writes the freshly-built index or, with `check`, verifies the
 * committed one already matches - refusing to do either if the source data
 * didn't validate, so a broken index is never written.
 *
 * Returns an exit code rather than calling process.exit, so the caller stays
 * testable and stdout gets a chance to flush.
 *
 * @param {object} options
 * @param {string[]} options.issues - validation issues; any at all block the write
 * @param {string} options.indexPath - where the committed index lives
 * @param {() => string} options.next - builds the serialized index. A thunk because
 *   building it can itself throw on data the validation above has already rejected,
 *   so it must not run until `issues` is known to be empty.
 * @param {number} options.count - how many source files went into it, for the log line
 * @param {string} options.noun - what those files are, singular ("season", "review")
 * @param {string} options.rebuildCommand - what to tell the reader to run when it's stale
 * @param {boolean} [options.check] - compare instead of writing
 * @param {Console} [options.out] - injectable for tests
 * @returns {number} 0 if all is well, 1 otherwise
 */
export function syncIndexFile({ issues, indexPath, next, count, noun, rebuildCommand, check = false, out = console }) {
  if (issues.length > 0) {
    out.error(`${issues.length} issue(s) found; index not written:\n`);
    for (const issue of issues) out.error(`  - ${issue}`);
    return 1;
  }

  const built = next();
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';

  if (check) {
    if (built !== current) {
      out.error(`index.json is out of date - run: ${rebuildCommand}`);
      return 1;
    }
    out.log(`index.json is up to date (${count} ${noun}(s)).`);
    return 0;
  }

  fs.writeFileSync(indexPath, built);
  out.log(
    current === built
      ? `index.json unchanged (${count} ${noun}(s)).`
      : `Wrote index.json (${count} ${noun}(s)).`
  );
  return 0;
}
