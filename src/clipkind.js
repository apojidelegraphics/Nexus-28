// Smart clipboard chips (3.7 beta): what did you just copy, and what would you most likely want to do with it?
//   classify(text) → { kind, label, icon, actions: [{ label, prompt? , url? }] } or null
// Quick Chat shows these as one-tap chips when it opens with something fresh on the clipboard.
const MONTHS = 'jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?';
const DAYS = 'mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?';
const STOP_EN = /\b(the|and|is|are|you|that|with|this|for|have|not|was|what)\b/gi;
const FOREIGN = /\b(el|la|los|las|que|de|und|der|die|das|ist|nicht|le|les|est|une|des|pas|il|che|di|non|um|uma|não|och|ett|är|het|een|niet|と|は|の|에|는)\b/gi;

function classify(raw) {
  const text = String(raw || '').trim();
  if (text.length < 3 || text.length > 20000) return null;
  const one = text.replace(/\s+/g, ' ');
  // a link
  if (/^https?:\/\/\S+$/i.test(text)) return { kind: 'url', icon: '🔗', label: 'a link', actions: [{ label: 'Summarize this page', prompt: `Summarize this page in a few bullet points: ${text}` }, { label: 'Open', url: text }] };
  // an error / stack trace
  if (/(Traceback \(most recent call last\)|\b[A-Z][A-Za-z]*(Error|Exception)\b[:\s]|\bat [\w.$<>]+ \(.+:\d+:\d+\)|error\[E\d+\]|\bnpm ERR!|Segmentation fault|undefined is not|cannot find module|SyntaxError)/.test(text))
    return { kind: 'error', icon: '🐞', label: 'an error', actions: [{ label: 'Explain this error', prompt: `Explain this error in plain words and what usually causes it:\n\n${text.slice(0, 6000)}` }, { label: 'How do I fix it?', prompt: `How do I fix this? Give the most likely fix first:\n\n${text.slice(0, 6000)}` }] };
  // code
  if (text.includes('\n') && /(\bfunction\b|=>|\bdef \w+\(|\bclass \w+|#include|\bconst \w+ =|\bimport \w+|\bpublic static\b|};?\s*$)/m.test(text))
    return { kind: 'code', icon: '⌨', label: 'some code', actions: [{ label: 'Explain this code', prompt: `Explain what this code does, step by step:\n\n\`\`\`\n${text.slice(0, 8000)}\n\`\`\`` }, { label: 'Find bugs', prompt: `Look for bugs or problems in this code:\n\n\`\`\`\n${text.slice(0, 8000)}\n\`\`\`` }] };
  // an email address / phone number
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text)) return { kind: 'email', icon: '✉', label: 'an email address', actions: [{ label: 'Write an email', prompt: `Help me write a short email to ${text} about: ` , draft: true }, { label: 'Open in Mail', url: 'mailto:' + text }] };
  // a street address
  if (one.length < 160 && /\b\d{1,6}\s+[\w .'-]{2,40}\b(st(reet)?|ave(nue)?|rd|road|blvd|boulevard|dr(ive)?|ln|lane|way|ct|court|pl(ace)?|pkwy|hwy|terrace|circle)\b\.?/i.test(one))
    return { kind: 'address', icon: '📍', label: 'an address', actions: [{ label: 'Open in Maps', url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(one) }, { label: 'Directions', url: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(one) }] };
  // a date or time
  if (one.length < 140 && (new RegExp(`\\b(${MONTHS})\\.? \\d{1,2}(st|nd|rd|th)?\\b|\\b\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?\\b|\\b(${DAYS})\\b.*\\b\\d{1,2}(:\\d\\d)?\\s?(am|pm)\\b|\\b(tomorrow|tonight|next week)\\b`, 'i')).test(one))
    return { kind: 'date', icon: '📅', label: 'a date', actions: [{ label: 'Add to my calendar', prompt: `Add this to my calendar: ${one}` }, { label: 'Remind me', prompt: `Remind me about this: ${one}` }] };
  // math
  if (/^[\d\s.,+\-*/^()%=x×÷]+$/.test(one) && /\d\s*[+\-*/^×÷x%]\s*\d/.test(one)) return { kind: 'math', icon: '🧮', label: 'a calculation', actions: [{ label: 'Calculate', prompt: `calc ${one.replace(/=\s*$/, '')}` }] };
  // another language
  const words = one.split(' ').length, en = (one.match(STOP_EN) || []).length, fr = (one.match(FOREIGN) || []).length;
  const nonLatin = (one.match(/[^\u0000-ɏ\s\d\p{P}]/gu) || []).length;
  if (words >= 3 && (fr > en + 1 || nonLatin > one.length * 0.3)) return { kind: 'foreign', icon: '🌐', label: 'text in another language', actions: [{ label: 'Translate to English', prompt: `Translate to English:\n\n${text.slice(0, 6000)}` }, { label: 'Explain it', prompt: `What does this say, and what's the tone?\n\n${text.slice(0, 6000)}` }] };
  // a long passage
  if (one.length > 500) return { kind: 'long', icon: '📄', label: 'a long passage', actions: [{ label: 'Summarize', prompt: `Summarize this in 3 bullet points:\n\n${text.slice(0, 12000)}` }, { label: 'Simplify', prompt: `Rewrite this so it's easy to understand:\n\n${text.slice(0, 12000)}` }] };
  return null;
}
module.exports = { classify };
