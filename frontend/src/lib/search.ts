// Usernames only contain a-z, 0-9 and _, so drop everything else
export function cleanUsernameQuery(query: string): string {
  return query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
}
