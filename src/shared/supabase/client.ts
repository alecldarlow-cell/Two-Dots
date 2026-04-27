/**
 * Supabase client.
 *
 * Lazy singleton — created on first access so module import doesn't crash when
 * env vars are missing (e.g. in test environments).
 *
 * The anon key is safe to ship — RLS policies in the DB gate all access.
 * See `supabase/migrations/*.sql` for the policies.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import type { Database } from './types';

let _client: SupabaseClient<Database> | null = null;

function readEnv(): { url: string; anonKey: string } {
  // Prefer Expo extra config (from app.config.ts), fall back to process.env so
  // tests and Node runners can inject via EXPO_PUBLIC_* without going through Expo.
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
  const url = extra.supabaseUrl ?? process.env['EXPO_PUBLIC_SUPABASE_URL'];
  const anonKey = extra.supabaseAnonKey ?? process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error(
      'Supabase env missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. See .env.example.',
    );
  }
  return { url, anonKey };
}

export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client;
  const { url, anonKey } = readEnv();
  _client = createClient<Database>(url, anonKey, {
    auth: {
      // No login flow — all reads/writes use the anon key. RLS in the DB is the
      // security boundary, not Supabase Auth.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

/** Reset the client. Tests only. */
export function __resetSupabaseClientForTests(): void {
  _client = null;
}
