// Terms & Conditions for Nexus '28 (desktop, Test Run, N28C) and Apoji Admin. One source for every place they show:
// Nexus Settings → Terms, the website (docs/terms, copied by scripts/build-terms.js) and Apoji Admin → Terms (copy).
// Bump VERSION when the meaning changes: signed-in people are asked to look at the new version once.
// Body items: a string is a paragraph, an array is a bullet list. **bold** works.
// This is a plain-language draft, not legal advice: have a lawyer look at it before relying on it.
(function (root) {
  const TERMS = {
    version: '1.0',
    effective: '2026-11-19',
    title: "Terms & Conditions — Nexus '28 and Apoji Admin",
    sections: [
      { id: 'about', title: '1. About these terms', body: [
        "These terms are an agreement between you and **Apoji Delegraphics** (\"Apoji\", \"we\", \"us\"), run by Lucas Bryant Roland. They cover Nexus '28 for Mac and Windows, Nexus Test Run (the web version), N28C (the phone app), the Nexus status and website pages, and Apoji Admin (together, \"the services\").",
        'By creating an account or using the services you agree to these terms. If you don\'t agree, please don\'t use the services.',
        'Some parts only apply to some people: section 10 is for beta testers and section 11 is for admins and moderators.'] },
      { id: 'age', title: '2. Who can use the services', body: [
        'You must be **at least 13 years old**. If you are under 18 (or under the age of adulthood where you live), a parent or legal guardian must agree to these terms for you and is responsible for your use.',
        'In some countries the age to agree on your own is higher (for example up to 16 in parts of Europe). If that applies to you, you need a parent or guardian\'s permission until you reach that age.',
        'If we learn that someone under 13 has an account, we will delete it.'] },
      { id: 'account', title: '3. Your account', body: [[
        'Give accurate information and keep your password safe. You are responsible for what happens on your account.',
        'One person per account. Don\'t share accounts to get around limits.',
        'If an Apoji admin gives you a temporary password, you\'ll be asked to choose your own the next time you sign in.',
        'You can delete your account at any time from Settings (desktop) or You → Edit account (N28C).']] },
      { id: 'services', title: '4. The services', body: [
        'Nexus \'28 is an AI assistant with several agents (such as Flash, Lyte, Neodela and Paragon), features like study decks, Spaces, missions, routines and voice, and apps that work together (Mac, Windows, web and phone).',
        'We add, change and remove features over time. Some features are labeled **beta**: they are unfinished and may change or go away.',
        'We try to keep the services running but can\'t promise they will always be available. Maintenance and outages are posted on the status page.'] },
      { id: 'ai', title: '5. AI answers', body: [[
        'AI can be wrong, incomplete or out of date, even when it sounds sure. Check important answers yourself.',
        'Nexus is **not** a doctor, lawyer, financial adviser or emergency service. Don\'t rely on it for medical, legal, financial or safety decisions.',
        'You are responsible for how you use what Nexus writes, including school work: follow your school\'s rules about AI.',
        'To answer you, your messages are sent to AI providers (for example OpenRouter, OpenAI, Anthropic, Google or Groq) depending on the agent and your settings. Those providers handle your messages under their own terms.',
        'Agents that can take actions on your computer (like Paragon) ask before doing anything that changes things. You are responsible for what you approve.']] },
      { id: 'keys', title: '6. Your own keys and connectors', body: [
        'If you add your own API keys or connect other services, they are stored on your device (or, if you choose, carried to your other computer locked with your passcode). Your use of those providers follows their terms, and any costs are yours.'] },
      { id: 'use', title: '7. Acceptable use', body: ['Don\'t use the services to:', [
        'break the law or help someone else break it;',
        'harass, threaten, bully or harm anyone, or share someone\'s private information;',
        'create or share sexual content involving minors, or any content that exploits children;',
        'make malware, attack systems, or try to get around security, limits, maintenance switches or bans;',
        'abuse the free Nexus key or free allowances (for example scripts, bots or many accounts);',
        'pretend to be someone else, including the Apoji Team;',
        'post content in Shared Spaces that breaks these rules.'],
        'We may remove content, limit features, or suspend accounts that break these rules. Reports can be sent from the apps.'] },
      { id: 'content', title: '8. Your content', body: [
        'You own what you write and what Nexus writes for you, as far as the law allows. You give us permission to store, process and send your content only as needed to run the services (for example syncing your chats if you turn sync on, or showing your posts to members of a Shared Space).',
        'Most of your data stays on your device: chats, study decks, memory and settings live there unless you turn on chat sync, move to another computer, or use features that need the cloud.'] },
      { id: 'training', title: '9. Helping train Nexus', body: [
        'Nexus gets better by learning from real conversations. Here is how that works:', [
        '**What is shared:** your question and Nexus\'s answer, which agent and model answered, which features were used, and any 👍 / 👎 or better answer you give.',
        '**What is removed first:** emails, phone numbers, API keys and tokens, card-like numbers, passwords and link tokens are stripped on your device before anything is sent.',
        '**Never shared:** incognito chats, Axiom, files and pictures you attach, and very short chats.',
        '**Who sees it:** members of the Apoji Team with training access review examples. Approved examples become "lessons" that help every agent answer better, and may be used to fine-tune Nexus models.',
        '**Beta testers:** sharing is part of being a beta tester and can\'t be turned off while you are in the beta program. To stop, leave the beta program.',
        '**Everyone else:** you are asked once, and you can say no or change your mind any time in Settings → Training. Saying no doesn\'t limit anything else in Nexus.',
        '**Deleting:** you can delete everything you shared from Settings → Training. Improvements already made from reviewed lessons may stay, but your examples are removed.']] },
      { id: 'beta', title: '10. Beta testers', who: ['beta'], body: [[
        'Joining the beta program is optional. Beta testers get features early and may get prerelease versions of the apps.',
        'Beta features can be unfinished, buggy or removed. Please report problems with the in-app tools.',
        'Beta testers share their chats to help train Nexus (section 9).',
        'You may be asked to test specific things. Testing is voluntary and unpaid unless we agree otherwise in writing.',
        'You can leave the beta program at any time by asking the Apoji Team.']] },
      { id: 'admins', title: '11. Admins, moderators and high-admins', who: ['admin'], body: [
        'Access to Apoji Admin is by invitation and can be changed or removed at any time by the Owner or a high-admin. If you are a moderator, admin or high-admin:', [
        '**Use access only to run the services:** helping people, moderation, testing, releases and training review. Don\'t look at people\'s information out of curiosity.',
        '**Keep it confidential:** don\'t copy, screenshot, share or export anyone\'s personal information, reports, chats or training examples outside Apoji Admin, unless the Owner asks you to for running the services or the law requires it.',
        '**Keep your account secure:** use a strong password, don\'t share your login or the team chat passphrase, and sign out on shared computers.',
        '**Actions are logged:** changes you make (to users, orders, flags, maintenance, lessons and more) are recorded with your name.',
        '**Training:** only push lessons that you or another reviewer checked. Pushing to everyone is limited to the Owner and the high-admins the Owner chooses.',
        '**Axiom:** controls for Axiom are limited to people the Owner allows. Don\'t share Axiom\'s instructions outside Apoji Admin.',
        '**Not a job:** being an admin or moderator is voluntary and doesn\'t make you an employee or give you a right to payment, unless agreed in writing.',
        '**Leaving:** when your access ends, stop using it and delete any Apoji information you have outside Apoji Admin.'],
        'Breaking these rules can mean losing access and, where the law requires, being reported.'] },
      { id: 'orders', title: '12. Orders and redemptions', body: [
        'Redeeming an aARgon3 or Mexel order links it to one Nexus account and turns on the perks for that plan. An order can only be redeemed on one account. We (or an admin helping you) can redeem or remove a redemption, for example if the order was refunded, cancelled or redeemed by mistake.'] },
      { id: 'limits', title: '13. Free allowances and limits', body: [
        'Free features have daily limits (for example answers on the free Nexus key, Nexus speech minutes, and Test Run answers). The limits are shown in the apps and may change. Your own keys are not limited by us.'] },
      { id: 'points', title: '14. Points, achievements and skins', body: [
        'Points, streaks, achievements, challenges and orb skins are for fun. They have no cash value, can\'t be sold or transferred, and may be reset or changed.'] },
      { id: 'privacy', title: '15. Privacy', body: [
        'What we keep in our cloud database (hosted by Supabase):', [
        'your account (email, username, nickname, picture) and settings you choose to sync;',
        'usage counts for limits, and which apps and versions you use ("active on");',
        'chats only if you turn on chat sync; Shared Space posts; feedback and bug reports (with screenshots you attach);',
        'training examples if you share them (section 9); test results if you are a tester.'],
        'We don\'t sell your personal information and the services don\'t show ads. We share data only with the providers that run the services (such as Supabase, AI providers, GitHub for updates, and email services for changelog emails you sign up for), or when the law requires it.',
        'We keep data while your account is open. When you delete your account, your cloud data is deleted, except records we must keep (such as moderation logs) for a limited time.'] },
      { id: 'regions', title: '16. Your privacy rights where you live', body: [
        '**United States:** depending on your state (for example California), you can ask to know, get a copy of, correct or delete your personal information, and you won\'t be treated differently for asking. We don\'t knowingly collect information from children under 13.',
        '**Canada:** under PIPEDA (and Quebec\'s privacy law), you can access and correct your information and withdraw consent, subject to legal limits. We use your information only for the purposes described here.',
        '**European Union, EEA, UK and Switzerland:** under the GDPR (and UK GDPR), we use your information to provide the services you asked for (contract), to keep them safe (legitimate interests), and for training only with your consent (or, for beta testers, as part of the beta program you chose to join). You can access, correct, delete, restrict, object, move your data, and withdraw consent at any time, and you can complain to your local data protection authority. Your data may be processed in the United States.',
        'To use any of these rights, contact us (section 21). We may need to confirm it\'s you.'] },
      { id: 'others', title: '17. Other services', body: [
        'The services use and link to other companies\' services (for example AI providers, GitHub, Supabase, Tailscale and app stores). Their terms and privacy policies apply to them, and we aren\'t responsible for them.'] },
      { id: 'ending', title: '18. Ending', body: [
        'You can stop using the services and delete your account at any time. We may suspend or close accounts that break these terms or put others at risk, and we may stop offering a service. Sections that should last (like 5, 8, 19 and 20) continue after.'] },
      { id: 'warranty', title: '19. No guarantees and limits on liability', body: [
        'The services are provided "as is" and "as available", without guarantees of any kind, to the extent the law allows.',
        'To the extent the law allows, Apoji is not liable for indirect or lost-profit damages, or for losses caused by AI answers, actions you approved, third-party services, or data you didn\'t back up. Our total liability is limited to the amount you paid us for the services in the 12 months before the claim (or US$50 if you paid nothing).',
        'Nothing in these terms takes away rights you have as a consumer that can\'t be waived where you live (for example in the EU, UK or Canada).'] },
      { id: 'law', title: '20. Changes and governing law', body: [
        'We may update these terms. When the meaning changes, we\'ll show the new version in the apps; continuing to use the services after that means you accept it.',
        'These terms are governed by the laws of the State of North Carolina, USA, without regard to conflict-of-law rules. If you live in Canada, the EU, EEA, UK or Switzerland, you also keep the protection of the mandatory laws of where you live and may bring claims in your local courts.'] },
      { id: 'contact', title: '21. Contact', body: [
        'Questions, privacy requests or reports: **apojidelegraphics101010@gmail.com**, or use Feedback in any Nexus app.'] }
    ]
  };
  // Render to HTML (escaped; **bold** only). who: filter to sections for a role (null = all).
  function toHTML(t = TERMS, { highlight = null } = {}) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return t.sections.map(s => `<section id="t-${s.id}" class="terms-sec${highlight && (s.who || []).includes(highlight) ? ' terms-hl' : ''}"><h3>${esc(s.title)}</h3>${s.body.map(b => Array.isArray(b) ? `<ul>${b.map(li => `<li>${inline(li)}</li>`).join('')}</ul>` : `<p>${inline(b)}</p>`).join('')}</section>`).join('');
  }
  const api = { TERMS, toHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NexusTerms = api;
})(typeof window !== 'undefined' ? window : globalThis);
