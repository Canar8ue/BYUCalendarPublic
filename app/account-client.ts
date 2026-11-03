'use client';
import {useCallback, useEffect, useState} from 'react';
import type {AccountState} from './types';

// The proxy in front of the worker returns HTML error pages during restarts
// and long-request cutoffs; parsing those as JSON would surface a cryptic
// "Unexpected token '<'" message instead of a retry hint.
async function readJSON<T>(response: Response): Promise<T> {
  const body = await response.text().catch(() => '');
  try { return JSON.parse(body) as T; } catch {
    throw new Error(response.ok ? 'The service returned an unexpected response. Try again.' : 'The calendar is briefly unavailable. Try again in a moment.');
  }
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  // 0 (or less) means no timeout — AbortSignal.timeout(0) aborts immediately,
  // which would cancel every default fetch.
  if (!ms || ms <= 0 || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return undefined;
  return AbortSignal.timeout(ms);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export async function postJSON<T = Record<string, unknown>>(url: string, body: unknown, timeoutMs = 60000): Promise<T> {
  try {
    const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: timeoutSignal(timeoutMs)});
    const data = await readJSON<{error?: string | {message?: string}; message?: string}>(response);
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || 'Your request could not be completed.');
    return data as T;
  } catch (err) {
    if (isAbort(err)) throw new Error('This is taking longer than usual. It may still complete — check in a moment before retrying.');
    throw err;
  }
}

export async function getJSON<T>(url: string, timeoutMs = 0): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', signal: timeoutSignal(timeoutMs)});
  const data = await readJSON<T & {error?: string}>(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The calendar is briefly unavailable. Try again in a moment.');
  return data;
}

export function useAccount() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/account', {cache: 'no-store'});
      if (!response.ok) throw new Error('Account information is temporarily unavailable.');
      setAccount(await response.json()); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load your account.'); }
  }, []);
  useEffect(() => {
    let active = true;
    fetch('/api/account', {cache: 'no-store'})
      .then(async response => { if (!response.ok) throw new Error('Account information is temporarily unavailable.'); return response.json() as Promise<AccountState>; })
      .then(data => { if (active) { setAccount(data); setError(''); } })
      .catch(() => { if (active) setError('Account information is temporarily unavailable.'); });
    return () => { active = false; };
  }, []);
  return {account, error, reload};
}
