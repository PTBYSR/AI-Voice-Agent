export const SUPABASE_URL = "https://qfkwdfqrkrgjejzqxrsm.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma3dkZnFya3JnamVqenF4cnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA5NzksImV4cCI6MjA5MTI5Njk3OX0.8nB60muA-EPI1eq04LUT5J_DjyvUIN_LrqoiRH6bALo";

export function sbHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export function sbFetch(path: string, options: RequestInit = {}) {
  const isQuery = path.includes("?");
  const separator = isQuery ? "&" : "?";
  
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...sbHeaders(),
      ...options.headers,
    },
  });
}
