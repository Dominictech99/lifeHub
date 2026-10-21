/* LifeHub login setup.
 *
 * Artisans log in with their phone number. Behind the scenes Supabase needs an email-shaped
 * name, so each phone number becomes:  yourgmail+p2348031234567@gmail.com
 * Gmail delivers anything after the "+" to your own inbox, so no stranger ever receives it.
 *
 * 1. Create a free Gmail just for LifeHub (for example lifehubng.auth@gmail.com).
 * 2. Put it below, replacing the placeholder. Use only that one address.
 * 3. Never change it after artisans have created their logins, or they will not be able to log in.
 */
window.LIFEHUB_AUTH_BASE = 'hello.lifehubng@gmail.com';