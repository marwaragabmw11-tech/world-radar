const UA = "Mozilla/5.0 (compatible; WorldRadarBot/1.0; +https://github.com/marwaragabmw11-tech/world-radar)";
const tg = `netanyahu bnetanyahu IsraeliPM israel_pm likud likudnik gadi_eisenkot gadieisenkot yashar_party yashar naftalibennett naftali_bennett NaftaliBennett yairlapid yair_lapid yeshatid yesh_atid yairgolan golanyair hademokratim mansourabbas mansour_abbas raam_party yisraelbeytenu liberman_avigdor avigdorliberman itamarbengvir ItamarBenGvir otzmayehudit otzma_yehudit bezalelsmotrich smotrich smotrich_b aryederi aryehderi shas shas_party goldknopf israelkatz israel_katz gidonsaar gideonsaar sarr_gideon isaacherzog presidentherzog idfofficial IDFspokesperson idf_telegram tzahal avichayadraee AvichayAdraee IsraelinArabic israelarabic ofirgendelman Ofir_Gendelman aymanodeh ayman_odeh jointlist yousefjabareen israelmfa IsraelMFA kan_news moshefeiglin yarivlevin`.split(/\s+/);
const yt = `IsraeliPM netanyahu Likud LikudParty gadieisenkot NaftaliBennett YairLapid YeshAtid IDF idfonline isaacherzog IsraelinArabic YisraelBeytenu itamarbengvir YairGolan KnessetChannel IsraelMFA AvichayAdraee`.split(/\s+/);
const attr = (html, re) => (html.match(re)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "he,en;q=0.8" }, signal: AbortSignal.timeout(20000) });
  return { status: r.status, url: r.url, text: await r.text() };
}
async function probeTg(name) {
  try {
    const { status, url, text } = await get(`https://t.me/s/${name}`);
    const msgs = (text.match(/tgme_widget_message_text/g) || []).length;
    const title = attr(text, /<meta property="og:title" content="([^"]*)"/);
    const subs = attr(text, /<span class="counter_value">([^<]*)<\/span>\s*<span class="counter_type">subscribers/);
    const times = [...text.matchAll(/<time datetime="([^"]+)"/g)].map(m => m[1]);
    const last = times.at(-1) || "";
    const verified = /verified-icon/.test(text);
    console.log(`TG ${msgs ? "OK " : "BAD"} ${name} | ${status} | msgs=${msgs} | title=${title} | subs=${subs} | last=${last} | verified=${verified} | final=${url}`);
  } catch (e) { console.log(`TG ERR ${name} ${e.message}`); }
}
async function probeYt(handle) {
  try {
    const { status, text } = await get(`https://www.youtube.com/@${handle}`);
    const id = attr(text, /"externalId":"(UC[\w-]{22})"/) || attr(text, /<meta itemprop="identifier" content="(UC[\w-]{22})"/) || attr(text, /"channelId":"(UC[\w-]{22})"/);
    const title = attr(text, /<meta property="og:title" content="([^"]*)"/);
    let feed = "";
    if (id) {
      const f = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
      const entries = (f.text.match(/<entry>/g) || []).length;
      const pub = attr(f.text, /<entry>[\s\S]*?<published>([^<]+)</);
      const t1 = attr(f.text, /<entry>[\s\S]*?<title>([^<]+)</);
      feed = `feed=${f.status} entries=${entries} latest=${pub} "${t1.slice(0, 60)}"`;
    }
    console.log(`YT ${id ? "OK " : "BAD"} ${handle} | ${status} | id=${id} | title=${title} | ${feed}`);
  } catch (e) { console.log(`YT ERR ${handle} ${e.message}`); }
}
async function probeUrl(id, url) {
  try { const { status, url: u, text } = await get(url); console.log(`URL ${id} | ${status} | final=${u} | items=${(text.match(/<item\b|"Title"/g) || []).length} | ${text.slice(0, 200).replace(/\s+/g, " ")}`); }
  catch (e) { console.log(`URL ERR ${id} ${e.message}`); }
}
const limit = async (list, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) await fn(list[i++]); })); };
await limit(tg, 5, probeTg);
await limit(yt, 4, probeYt);
await probeUrl("govil-pmo-rss", "https://www.gov.il/he/departments/prime_ministers_office/govil-landing-page/rss");
await probeUrl("govil-api", "https://www.gov.il/CollectorsWebApi/api/DataCollector/GetResults?CollectorType=news&culture=he&skip=0&limit=5");
await probeUrl("knesset-rss", "https://main.knesset.gov.il/News/PressReleases/_layouts/15/listfeed.aspx?List=%7B2C3AB6B5-4F7A-4F5C-9E5F-5C3B5C9F6E2B%7D");
await probeUrl("gn-netanyahu-statement", "https://news.google.com/rss/search?q=%22%D7%A0%D7%AA%D7%A0%D7%99%D7%94%D7%95%22+when:1d&hl=he&gl=IL&ceid=IL:he");
