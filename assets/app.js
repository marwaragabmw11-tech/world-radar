(() => {
  "use strict";

  const I18N = window.WR_I18N;
  const LOCALES = Object.keys(I18N);
  const PAGE = 30;
  const REFRESH_MS = 10 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };

  function pickLocale() {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (LOCALES.includes(fromUrl)) return fromUrl;
    const saved = store.get("wr-lang");
    if (LOCALES.includes(saved)) return saved;
    for (const l of navigator.languages || [navigator.language || ""]) {
      const base = String(l).toLowerCase().split("-")[0];
      if (base === "iw") return "he";
      if (LOCALES.includes(base)) return base;
    }
    return "en";
  }

  const state = {
    ui: pickLocale(),
    scope: null,      // "mine" | "all"; decided once data arrives
    source: "",
    q: "",
    shown: PAGE,
    data: null
  };

  const t = (key, vars) => {
    let s = (I18N[state.ui] && I18N[state.ui][key]) ?? I18N.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };

  // ---------- formatting ----------
  let numFmt, rtf, langNames;
  function setFormatters() {
    numFmt = new Intl.NumberFormat(state.ui);
    rtf = new Intl.RelativeTimeFormat(state.ui, { numeric: "auto" });
    try { langNames = new Intl.DisplayNames([state.ui], { type: "language" }); } catch { langNames = null; }
  }
  function langName(code) {
    return (langNames && langNames.of(code)) || (I18N[code] && I18N[code].name) || code;
  }
  function relTime(iso) {
    if (!iso) return "";
    const diff = (Date.parse(iso) - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) return t("justNow");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    return rtf.format(Math.round(diff / 86400), "day");
  }
  function absTime(iso) {
    try {
      return new Intl.DateTimeFormat(state.ui, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch { return iso; }
  }
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }

  // ---------- static UI ----------
  function applyLocale() {
    const conf = I18N[state.ui];
    document.documentElement.lang = state.ui;
    document.documentElement.dir = conf.dir;
    setFormatters();
    document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
    document.title = `World Radar — ${t("heroTitle")} ${t("heroAccent")}`;
    const sel = $("locale");
    sel.replaceChildren(...LOCALES.map((code) => el("option", { value: code, lang: code, text: I18N[code].name })));
    sel.value = state.ui;
    sel.setAttribute("aria-label", t("language"));
  }

  // ---------- data ----------
  const sourceById = () => Object.fromEntries((state.data?.sources || []).map((s) => [s.id, s]));

  function filtered() {
    const articles = state.data?.articles || [];
    const q = state.q.trim().toLocaleLowerCase();
    return articles.filter((a) => {
      if (state.scope === "mine" && a.lang !== state.ui) return false;
      if (state.source && a.sourceId !== state.source) return false;
      if (q && !(`${a.title} ${a.excerpt || ""}`).toLocaleLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderStats() {
    const d = state.data;
    if (!d) return;
    $("stat-stories").textContent = numFmt.format(d.stats?.articles ?? d.articles.length);
    $("stat-sources").textContent = `${numFmt.format(d.stats?.sourcesOk ?? 0)}/${numFmt.format(d.stats?.sourcesTotal ?? 0)}`;
    const up = $("stat-updated");
    up.textContent = d.generatedAt ? `${relTime(d.generatedAt)} · ${absTime(d.generatedAt)}` : "–";
    $("demo-banner").hidden = !d.demo;
  }

  function renderTrends() {
    const box = $("trends");
    const list = (state.data?.trends || {})[state.ui] || [];
    if (!list.length) {
      box.replaceChildren(el("p", { class: "chips-empty", text: t("trendingEmpty") }));
      return;
    }
    box.replaceChildren(...list.map((tr) => {
      const active = state.q.trim().toLocaleLowerCase() === tr.term;
      const b = el("button", { type: "button", class: `chip${active ? " active" : ""}`, "aria-pressed": String(active), dir: "auto" }, [
        el("span", { text: tr.term }),
        el("span", { class: "chip-count", text: numFmt.format(tr.sources) })
      ]);
      b.addEventListener("click", () => {
        state.q = active ? "" : tr.term;
        state.scope = "mine";
        $("search").value = state.q;
        state.shown = PAGE;
        renderAll();
        if (!active) $("latest").scrollIntoView();
      });
      return b;
    }));
  }

  function renderSourceFilter() {
    const sel = $("source-filter");
    const sources = (state.data?.sources || [])
      .filter((s) => state.scope !== "mine" || s.lang === state.ui)
      .sort((a, b) => a.name.localeCompare(b.name, state.ui));
    if (state.source && !sources.some((s) => s.id === state.source)) state.source = "";
    sel.replaceChildren(
      el("option", { value: "", text: t("allSources") }),
      ...sources.map((s) => el("option", { value: s.id, text: s.name }))
    );
    sel.value = state.source;
    sel.setAttribute("aria-label", t("allSources"));
  }

  function storyCard(a, sources) {
    const src = sources[a.sourceId] || { name: a.sourceId };
    const url = safeUrl(a.url);
    const isDemo = !!state.data?.demo;
    const titleNode = url
      ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: a.title })
      : el("span", { text: a.title });
    return el("article", { class: "story-card", lang: a.lang, dir: I18N[a.lang]?.dir || "auto" }, [
      el("div", { class: "story-meta" }, [
        el("span", { class: "story-source", text: src.name }),
        isDemo
          ? el("span", { class: "lang-badge demo-badge", text: "DEMO" })
          : el("span", { class: "lang-badge", lang: state.ui, text: langName(a.lang) })
      ]),
      el("h3", {}, titleNode),
      a.excerpt ? el("p", { class: "story-summary", text: a.excerpt }) : null,
      el("div", { class: "story-footer", lang: state.ui, dir: I18N[state.ui].dir }, [
        el("time", { datetime: a.publishedAt || a.fetchedAt || "", title: a.publishedAt ? absTime(a.publishedAt) : null, text: relTime(a.publishedAt || a.fetchedAt) }),
        url ? el("a", { class: "read-link", href: url, target: "_blank", rel: "noopener noreferrer", text: t("readAt", { source: src.name }) }) : null
      ])
    ]);
  }

  function renderStories() {
    const list = filtered();
    const sources = sourceById();
    $("stories").replaceChildren(...list.slice(0, state.shown).map((a) => storyCard(a, sources)));
    const empty = $("empty");
    empty.hidden = list.length > 0;
    empty.textContent = t("noResults");
    $("more").hidden = list.length <= state.shown;
  }

  function renderScope() {
    document.querySelectorAll(".seg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scope === state.scope)));
  }

  function renderSources() {
    const list = (state.data?.sources || []).slice().sort((a, b) =>
      (a.lang === state.ui ? -1 : 0) - (b.lang === state.ui ? -1 : 0) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
    $("source-list").replaceChildren(...list.map((s) => {
      const home = safeUrl(s.home);
      const name = home ? el("a", { href: home, target: "_blank", rel: "noopener noreferrer", text: s.name }) : el("span", { text: s.name });
      return el("div", { class: `source-item${s.ok ? "" : " down"}`, title: s.ok ? null : (s.error || "") }, [
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("span", { class: "name", dir: "auto" }, name),
        el("span", { class: "state", text: `${langName(s.lang)} · ${s.ok ? t("sourceOk") : t("sourceDown")}` })
      ]);
    }));
  }

  function renderAll() {
    renderStats();
    renderScope();
    renderTrends();
    renderSourceFilter();
    renderStories();
    renderSources();
  }

  function decideScope() {
    if (state.scope) return;
    const hasMine = (state.data?.articles || []).some((a) => a.lang === state.ui);
    state.scope = hasMine && !state.data?.demo ? "mine" : "all";
  }

  async function load(initial) {
    if (initial) {
      $("stories").replaceChildren(el("p", { class: "empty", text: t("loading") }));
    }
    try {
      const bucket = Math.floor(Date.now() / 300000); // cache-bust every 5 minutes
      const res = await fetch(`data/news.json?v=${bucket}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.articles)) throw new Error("bad data");
      state.data = data;
      decideScope();
      renderAll();
    } catch (err) {
      console.error(err);
      if (!state.data) {
        $("stories").replaceChildren();
        const empty = $("empty");
        empty.hidden = false;
        empty.textContent = t("loadError");
      }
    }
  }

  // ---------- events ----------
  $("locale").addEventListener("change", (e) => {
    state.ui = e.target.value;
    store.set("wr-lang", state.ui);
    const url = new URL(location.href);
    url.searchParams.set("lang", state.ui);
    history.replaceState(null, "", url);
    state.scope = null;
    state.source = "";
    state.shown = PAGE;
    applyLocale();
    if (state.data) { decideScope(); renderAll(); }
  });

  let searchTimer;
  $("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value;
      state.shown = PAGE;
      renderTrends();
      renderStories();
    }, 180);
  });

  document.querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => {
    state.scope = b.dataset.scope;
    state.shown = PAGE;
    renderScope();
    renderSourceFilter();
    renderStories();
  }));

  $("source-filter").addEventListener("change", (e) => {
    state.source = e.target.value;
    state.shown = PAGE;
    renderStories();
  });

  $("more").addEventListener("click", () => {
    state.shown += PAGE;
    renderStories();
  });

  applyLocale();
  load(true);
  setInterval(() => { if (!document.hidden) load(false); }, REFRESH_MS);
  setInterval(() => { if (state.data && !document.hidden) { renderStats(); } }, 60000);
})();
