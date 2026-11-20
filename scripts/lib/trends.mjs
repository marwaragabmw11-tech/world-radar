// "What's emerging": terms that several *different* publishers are using in
// their headlines right now. Pure counting — no AI, no paid service.

const STOPWORDS = {
  en: "the a an and or of to in on for with at by from as is are was were be been it its this that these those after over into about amid says say said new more than not but has have had will can could would who what why how when where us uk up out his her their they he she we you our your i vs live latest news update video watch".split(" "),
  ar: "في من على إلى الى عن مع أن ان إن هذا هذه ذلك التي الذي الذين بعد قبل خلال حول كان كانت يكون تكون لم لن ما لا هل أو او ثم كل بين ضد عند منذ حتى قد وقد وفي ومن وعلى بعض أكثر اكثر غير يوم اليوم عام أول اول عبر فيديو مباشر جديد جديدة قال قالت تقرير".split(" "),
  he: "של את על עם אל לא כי זה זו גם או אם הוא היא הם הן אני אנחנו יש אין כל אחרי לפני בין מה מי איך למה כך עוד היום וידאו".split(" "),
  fr: "le la les un une des du de d l et ou à au aux en dans sur pour par avec sans est sont été être a ont qui que quoi dont ce cette ces son sa ses leur leurs il elle ils elles on nous vous plus après avant contre entre selon vidéo direct".split(" "),
  es: "el la los las un una unos unas de del al y o a en por para con sin es son fue ser ha han que qué como cómo su sus se lo le les más tras ante entre sobre contra según este esta estos estas video vivo".split(" "),
  de: "der die das den dem des ein eine einer eines einem einen und oder in im ins an am auf aus bei mit nach von vom zu zum zur für über unter vor gegen ist sind war waren wird werden hat haben nicht auch noch wie was wer sich es er sie wir ihr so nur mehr als bis seit video live".split(" "),
  pt: "o a os as um uma uns umas de do da dos das e ou em no na nos nas por para com sem é são foi ser que se seu sua seus suas mais após entre sobre contra como diz vídeo".split(" "),
  ja: "こと ため もの よう これ それ あれ する した して いる ある なる れる られる など から まで について による ニュース 動画".split(" "),
  zh: "的 了 和 是 在 与 及 或 也 都 而 被 把 对 为 于 将 就 这 那 有 中 上 下 后 前 说 称 新闻 视频".split(" ")
};

const STOP = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words)])
);

const segmenters = new Map();
function segmenter(lang) {
  if (!segmenters.has(lang)) {
    segmenters.set(lang, new Intl.Segmenter(lang, { granularity: "word" }));
  }
  return segmenters.get(lang);
}

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;

/** @returns {{key:string, surface:string}[]} unique terms of a headline */
export function tokenizeWithSurface(title, lang) {
  const minLen = lang === "ja" || lang === "zh" ? 2 : 3;
  const stop = STOP[lang] || new Set();
  const terms = new Map();
  for (const { segment, isWordLike } of segmenter(lang).segment(title)) {
    if (!isWordLike) continue;
    const surface = segment.normalize("NFKC").toLocaleLowerCase(lang);
    let key = surface.replace(ARABIC_DIACRITICS, "");
    if (lang === "ar") key = key.replace(/^(?:وال|بال|فال|كال|ال)(?=\S{3,})/, "");
    if (key.length < minLen || /^\d+$/.test(key) || stop.has(key) || stop.has(surface)) continue;
    if (!terms.has(key)) terms.set(key, surface);
  }
  return [...terms].map(([key, surface]) => ({ key, surface }));
}

export function tokenize(title, lang) {
  return tokenizeWithSurface(title, lang).map((t) => t.key);
}

/**
 * @param {{title:string, lang:string, sourceId:string, publishedAt:string|null}[]} articles
 * @returns {Record<string, {term:string, sources:number, mentions:number}[]>} term = display form
 */
export function computeTrends(articles, { now = Date.now(), windowHours = 24, perLang = 12 } = {}) {
  const cutoff = now - windowHours * 3600_000;
  const byLang = {};
  for (const a of articles) {
    if (a.publishedAt && Date.parse(a.publishedAt) < cutoff) continue;
    const bucket = (byLang[a.lang] ??= new Map());
    for (const { key, surface } of tokenizeWithSurface(a.title, a.lang)) {
      const entry = bucket.get(key) ?? { key, sources: new Set(), mentions: 0, forms: new Map() };
      entry.sources.add(a.sourceId);
      entry.mentions += 1;
      entry.forms.set(surface, (entry.forms.get(surface) || 0) + 1);
      bucket.set(key, entry);
    }
  }
  const result = {};
  for (const [lang, bucket] of Object.entries(byLang)) {
    result[lang] = [...bucket.values()]
      .filter((e) => e.sources.size >= 2)
      .sort((x, y) => y.sources.size - x.sources.size || y.mentions - x.mentions)
      .slice(0, perLang)
      .map((e) => ({
        // Show the spelling publishers actually used most (e.g. «القاهرة», not the stem).
        term: [...e.forms].sort((x, y) => y[1] - x[1])[0][0],
        sources: e.sources.size,
        mentions: e.mentions
      }));
  }
  return result;
}
