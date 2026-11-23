// Minimal glob → RegExp for repo-relative POSIX paths.
// Supports: `*` (no slash), `**` (any depth, incl. zero dirs when written as `**/`),
// `?` (one non-slash char) and `{a,b}` alternation (nestable). No negation: use `exclude`.

/** Expand `{a,b}` groups, innermost first. */
export function expandBraces(glob) {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  const head = glob.slice(0, m.index);
  const tail = glob.slice(m.index + m[0].length);
  return [...new Set(m[1].split(',').flatMap((alt) => expandBraces(head + alt + tail)))];
}

function toRegExpSource(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        if (atSegmentStart && glob[i + 2] === '/') {
          re += '(?:.*/)?'; // `**/` — zero or more directories
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return `^${re}$`;
}

export function globToRegExp(glob) {
  return new RegExp(toRegExpSource(glob));
}

/** Returns `(path) => boolean` that is true when any of the globs matches. */
export function makeMatcher(globs = []) {
  const regexes = globs.flatMap(expandBraces).map(globToRegExp);
  return (path) => regexes.some((r) => r.test(path));
}
