# Changelog emails with EmailJS

People opt in from Nexus '28 (Settings → Personal → Changelog email) or N28C (You → Release notes). A high-admin sends each release from **Apoji Admin → Releases → ✉ Email the changelog**. Every email has its own one-click unsubscribe link (`docs/unsubscribe/`).

## 1. Database

Run `supabase/nexus-v2.7.sql` in Supabase → SQL Editor (after `nexus-v2.6.sql`). It adds `changelog_subscribers`, the subscribe/unsubscribe functions, the high-admin recipient list and `admin_settings`, where your EmailJS ids are stored.

## 2. EmailJS account

1. Sign up at emailjs.com. The free plan sends 200 emails a month.
2. **Email Services → Add New Service.** Pick Gmail (or Outlook, or your own SMTP), connect the address the emails should come from, and copy the **Service ID** (`service_…`).
3. **Email Templates → Create New Template.**
   - **Subject:** `Nexus '28 {{version}}: {{title}}`
   - **Content:** click *Edit Content → Code editor* and paste all of `docs/email/changelog-template.html`.
   - **To Email:** `{{to_email}}` (important: otherwise everything goes to you).
   - **From Name:** `Nexus '28`. **Reply To:** an address you read.
   - Save, then copy the **Template ID** (`template_…`).
4. **Account → General:** copy the **Public Key**.
5. **Account → Security:**
   - Turn on **Use Private Key (recommended)** and copy the **Private Key**. With it on, nobody who finds your public key can send mail through your account.
   - If sends from the Mac app fail with "API calls are disabled for non-browser applications", turn on **Allow EmailJS API for non-browser applications**.
   - Leave the domain allowlist empty. Apoji Admin also runs as a Mac app, which has no website domain to allow.

## 3. Apoji Admin

Open **Releases → ✉ Email the changelog → EmailJS settings**. Paste the Service ID, Template ID, Public Key and Private Key, then Save. They're kept in Supabase (`admin_settings`), readable by high-admins only, and never in either repo.

Then:

1. Pick the version (the list comes from `docs/whats-new/changes.json`, so push the release first).
2. Click **Preview**.
3. Click **Send me a test**.
4. Click **Send to N**.

Sending goes about one email a second. You can stop it at any time. Each person gets a release only once (`last_sent_version`), so you can safely press Send again later for anyone who subscribed since.

## Template variables

| Variable | What it is |
|---|---|
| `{{to_email}}`, `{{email}}` | Subscriber's address |
| `{{to_name}}` | Nickname, username or the part before the @ |
| `{{version}}`, `{{title}}`, `{{date}}` | From `changes.json` |
| `{{{highlights_html}}}` | One accent box per highlight. Use **triple** braces so EmailJS keeps the HTML. |
| `{{highlights_text}}` | Same list as plain text, if you'd rather |
| `{{whats_new_url}}`, `{{release_url}}` | What's new page and the GitHub release |
| `{{unsubscribe_url}}` | One-click unsubscribe for this person |
| `{{logo_url}}` | The Nexus icon on GitHub Pages |

## RSS

`docs/whats-new/feed.xml` is built from `changes.json` by `node scripts/build-feed.js`. `npm test` fails if you forget to rebuild it.
