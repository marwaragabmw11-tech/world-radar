// Read the public web preview of a Telegram channel (https://t.me/s/<handle>).
// This is the page Telegram itself serves to anyone without logging in.
// We keep only the text, the date and the link of each post.

import { decodeEntities } from "./rss.mjs";

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<i class="emoji"[^>]*>([\s\S]*?)<\/i>/gi, "$1")
      .replace(/<\/?[a-z][^>]*>/gi, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @returns {{title:string, verified:boolean, posts:{id:string, url:string, text:string, publishedAt:Date|null, forwarded:boolean}[]}}
 */
export function parseTelegramPreview(html, handle) {
  const title = decodeEntities(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "");
  const verified = /class="verified-icon"/.test(html);
  const blocks = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  const posts = [];
  for (const block of blocks) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/);
    if (!post || post[1].toLowerCase() !== handle.toLowerCase()) continue;
    const textHtml = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!textHtml) continue; // media-only post
    const text = htmlToText(textHtml);
    if (!text) continue;
    const time = block.match(/<time datetime="([^"]+)"/)?.[1];
    const date = time ? new Date(time) : null;
    posts.push({
      id: `${post[1]}/${post[2]}`,
      url: `https://t.me/${post[1]}/${post[2]}`,
      text,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      forwarded: /tgme_widget_message_forwarded_from/.test(block)
    });
  }
  return { title, verified, posts };
}

/**
 * True when a headline quotes the person: their name directly followed by a
 * colon, e.g. «בן גביר: ...» or «Netanyahu: ...».
 */
export function isQuoteHeadline(title, names) {
  return names.some((name) => {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[\\s"״“«(\\-–])${n}['׳"״]?\\s*:`, "u").test(title);
  });
}
