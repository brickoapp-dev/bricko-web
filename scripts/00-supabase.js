/* 00-supabase.js — Inicialización del cliente Supabase */

const SUPABASE_URL = 'https://wkyqetwyswocrohayiss.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndreXFldHd5c3dvY3JvaGF5aXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTUyMzQsImV4cCI6MjA5NDc5MTIzNH0.W0msddSTRWrh2d7EMVJ02qTp6uT8FIOET1DkqXnsRl4';

window.supabase_client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);