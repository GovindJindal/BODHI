'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiErrorMessage } from './api';

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * GET an /admin-v2 endpoint. Refetches when `path` or `params` change;
 * `reload()` refetches on demand. Stale responses are dropped.
 */
export function useApi<T>(path: string | null, params?: Record<string, string | number | undefined>) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: Boolean(path) });
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify(params ?? {});
  const seq = useRef(0);

  useEffect(() => {
    if (!path) return;
    const id = ++seq.current;
    const query = JSON.parse(key) as Record<string, string | number | undefined>;
    Object.keys(query).forEach((k) => (query[k] === undefined || query[k] === '') && delete query[k]);
    // Mark as loading inside the promise chain (keeps the effect free of synchronous setState).
    Promise.resolve()
      .then(() => {
        if (id === seq.current) setState((s) => ({ ...s, loading: true, error: null }));
        return api.get<T>(path, { params: query });
      })
      .then((res) => {
        if (id === seq.current) setState({ data: res.data, error: null, loading: false });
      })
      .catch((err) => {
        if (id === seq.current) setState((s) => ({ ...s, error: apiErrorMessage(err, 'Could not load this data. Check that the API is reachable.'), loading: false }));
      });
  }, [path, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload, setData: (fn: (d: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })) };
}
