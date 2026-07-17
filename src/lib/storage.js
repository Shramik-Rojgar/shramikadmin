import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const BUCKET = 'shramikfiles';

// Long enough to open a document and read it, short enough that a URL pasted
// into a chat or leaked in a referrer header is dead by the time anyone tries
// it. Signed URLs bypass RLS for their lifetime, so this is the blast radius.
const DEFAULT_TTL_SECONDS = 300;

/**
 * Pull the storage path out of a legacy public URL.
 * '<project>/storage/v1/object/public/shramikfiles/laborgovid/98x.jpg'
 *   -> 'laborgovid/98x.jpg'
 * Returns null if the URL doesn't point into our bucket.
 */
function pathFromPublicUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length)).split('?')[0] || null;
}

/**
 * Exchange a stored path for a signed URL. Returns null for empty input so
 * callers can pass a possibly-absent column straight through.
 *
 * These columns hold a storage path ('laborgovid/<uuid>.jpg'), not a URL — the
 * bucket is private. Rows written before that change still hold a full public
 * URL, which now 403s; unwrap those back to a path and sign that, so legacy
 * rows render from the moment this deploys rather than staying broken until
 * scripts/rekey-storage.js has run.
 */
export async function getSignedUrl(pathOrUrl, expiresIn = DEFAULT_TTL_SECONDS) {
  if (!pathOrUrl) return null;

  let path = pathOrUrl;
  if (path.startsWith('http')) {
    path = pathFromPublicUrl(path);
    // Points somewhere outside our bucket — hand it back and let the browser try.
    if (!path) return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * Signed URL for one stored path, refetched when the path changes.
 * Returns { url, loading, error } — url is null until it resolves.
 */
export function useSignedUrl(path, expiresIn = DEFAULT_TTL_SECONDS) {
  const [state, setState] = useState({ url: null, loading: !!path, error: null });

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ url: null, loading: true, error: null });

    getSignedUrl(path, expiresIn)
      .then((url) => { if (!cancelled) setState({ url, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ url: null, loading: false, error: err }); });

    return () => { cancelled = true; };
  }, [path, expiresIn]);

  return state;
}

/**
 * Signed URLs for a list of rows — one round trip per distinct path, deduped.
 * Returns a { [path]: signedUrl } map so table cells can look themselves up
 * without each firing its own request.
 */
export function useSignedUrlMap(paths, expiresIn = DEFAULT_TTL_SECONDS) {
  const [map, setMap] = useState({});

  // Sorted + joined so a re-render with the same paths in the same order
  // doesn't refetch. Paths are opaque UUIDs, so this key stays small.
  const key = [...new Set(paths.filter(Boolean))].sort().join('|');

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) {
      setMap({});
      return;
    }

    let cancelled = false;
    Promise.all(
      list.map((p) =>
        getSignedUrl(p, expiresIn)
          .then((url) => [p, url])
          .catch(() => [p, null]),
      ),
    ).then((entries) => {
      if (!cancelled) setMap(Object.fromEntries(entries));
    });

    return () => { cancelled = true; };
  }, [key, expiresIn]);

  return map;
}
