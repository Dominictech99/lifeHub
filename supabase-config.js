// Shared Supabase client for LifeHub.
// The publishable key is safe to expose in frontend code — it only allows
// what the Row Level Security policies in schema.sql permit.

const SUPABASE_URL = 'https://nmynrllbfsmrbhauhnxv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rLq0gkbq_QN2BAbm2fnjgg_bf702Ced';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);