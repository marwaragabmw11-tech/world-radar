(() => {
  "use strict";

  const I18N = window.WR_I18N;
  const LOCALES = Object.keys(I18N);
  const PAGE = 30;
  const REFRESH_MS = 10 * 60 * 1000;
  const COMPARE_PER_COL = 6;

  const LEAN_KEYS = { "left": "lean_left", "center-left": "lean_centerLeft", "center": "lean_center", "center-right": "lean_centerRight", "right": "lean_right" };
  const LEAN_ORDER = Object.keys(LEAN_KEYS);
  const COMPARE_COLS = [
    { key: "compareLeft", leanings: ["left", "center-left"], cls: "col-left" },
    { key: "compareCenter", leanings: ["center"], cls: "col-center" },
    { key: "compareRight", leanings: ["center-right", "right"], cls: "col-right" }
  ];

  // Best guess of the reader's country, used as the default for local news and searches.
  const TZ_COUNTRY = {
    "Africa/Cairo": "EG", "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Africa/Casablanca": "MA", "Asia/Amman": "JO",
    "Asia/Beirut": "LB", "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL", "Europe/London": "GB", "Europe/Paris": "FR",
    "Europe/Berlin": "DE", "Europe/Madrid": "ES", "America/Mexico_City": "MX", "America/Sao_Paulo": "BR",
    "Europe/Lisbon": "PT", "Asia/Tokyo": "JP", "Asia/Taipei": "TW", "Asia/Hong_Kong": "HK"
  };
  const LANG_COUNTRY = { ar: "EG", he: "IL", en: "US", fr: "FR", es: "ES", de: "DE", pt: "BR", ja: "JP", zh: "TW" };

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

  function guessCountry(ui) {
    const saved = store.get("wr-country");
    if (saved) return saved;
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* ignore */ }
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (tz.startsWith("America/") && !tz.includes("Mexico") && !tz.includes("Sao_Paulo")) return "US";
    return LANG_COUNTRY[ui] || "US";
  }

  const ui0 = pickLocale();
  const state = {
    ui: ui0,
    section: "all",   // "all" | "world" | "local"
    scope: null,      // "mine" | "all"; decided once data arrives
    country: guessCountry(ui0),
    leaning: "",
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
  let numFmt, rtf, langNames, regionNames;
  function setFormatters() {
    numFmt = new Intl.NumberFormat(state.ui);
    rtf = new Intl.RelativeTimeFormat(state.ui, { numeric: "auto" });
    try { langNames = new Intl.DisplayNames([state.ui], { type: "language" }); } catch { langNames = null; }
    try { regionNames = new Intl.DisplayNames([state.ui], { type: "region" }); } catch { regionNames = null; }
  }
  const langName = (code) => (langNames && langNames.of(code)) || (I18N[code] && I18N[code].name) || code;
  const countryName = (code) => { try { return (regionNames && regionNames.of(code)) || code; } catch { return code; } };
  const leanLabel = (l) => (LEAN_KEYS[l] ? t(LEAN_KEYS[l]) : "");
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
  const timeOf = (a) => Date.parse(a.publishedAt || a.fetchedAt);

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
  const leanBadge = (l) => el("span", { class: `lean-badge lean-${l}`, text: leanLabel(l) });

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

  // ---------- data helpers ----------
  let sourceMap = {};
  const src = (id) => sourceMap[id] || { id, name: id };

  const localCountries = () => [...new Set((state.data?.sources || []).filter((s) => s.section === "local").map((s) => s.country))];
  const trendCountries = () => Object.keys(state.data?.searchTrends || {});

  function fillCountrySelect(sel, codes) {
    const sorted = codes.slice().sort((a, b) => countryName(a).localeCompare(countryName(b), state.ui));
    sel.replaceChildren(...sorted.map((c) => el("option", { value: c, text: countryName(c) })));
    sel.value = codes.includes(state.country) ? state.country : sorted[0] || "";
    sel.setAttribute("aria-label", t("country"));
  }

  /** Sources that match the current tab / country / language scope (before leaning & source filters). */
  function sourceInScope(s) {
    if (state.section === "world" && s.section !== "world") return false;
    if (state.section === "local" && !(s.section === "local" && s.country === effectiveLocalCountry())) return false;
    if (state.section !== "local" && state.scope === "mine" && s.lang !== state.ui) return false;
    return true;
  }
  function effectiveLocalCountry() {
    const list = localCountries();
    return list.includes(state.country) ? state.country : list[0];
  }

  function matchesQuery(a) {
    const q = state.q.trim().toLocaleLowerCase();
    return !q || (`${a.title} ${a.excerpt || ""}`).toLocaleLowerCase().includes(q);
  }

  function filtered() {
    return (state.data?.articles || []).filter((a) => {
      const s = src(a.sourceId);
      if (!sourceInScope(s)) return false;
      if (state.leaning && s.leaning !== state.leaning) return false;
      if (state.source && a.sourceId !== state.source) return false;
      return matchesQuery(a);
    });
  }

  // ---------- rendering ----------
  function renderStats() {
    const d = state.data;
    if (!d) return;
    $("stat-stories").textContent = numFmt.format(d.stats?.articles ?? d.articles.length);
    $("stat-sources").textContent = `${numFmt.format(d.stats?.sourcesOk ?? 0)}/${numFmt.format(d.stats?.sourcesTotal ?? 0)}`;
    $("stat-updated").textContent = d.generatedAt ? `${relTime(d.generatedAt)} · ${absTime(d.generatedAt)}` : "–";
    $("demo-banner").hidden = !d.demo;
  }

  function renderSearchTrends() {
    const sel = $("trends-country");
    const codes = trendCountries();
    sel.hidden = codes.length === 0;
    fillCountrySelect(sel, codes);
    const entry = (state.data?.searchTrends || {})[sel.value];
    const box = $("search-trends");
    if (!entry || !entry.items?.length) {
      box.replaceChildren(el("p", { class: "chips-empty", text: t("searchTrendsEmpty") }));
      return;
    }
    box.replaceChildren(...entry.items.map((tr) => {
      const href = `https://news.google.com/search?q=${encodeURIComponent(tr.term)}&hl=${encodeURIComponent(entry.hl || state.ui)}&gl=${encodeURIComponent(entry.country)}`;
      return el("a", { class: "chip chip-link", href, target: "_blank", rel: "noopener noreferrer", dir: "auto" }, [
        el("span", { text: tr.term }),
        tr.traffic ? el("span", { class: "chip-traffic", dir: "ltr", text: tr.traffic }) : null
      ]);
    }));
  }

  function renderTrends() {
    const box = $("trends");
    const list = (state.data?.trends || {})[state.ui] || [];
    if (!list.length) {
      box.replaceChildren(el("p", { class: "chips-empty", text: t("trendingEmpty") }));
      return;
    }
    box.replaceChildren(...list.map((tr) => {
      const active = state.q.trim().toLocaleLowerCase() === tr.term.toLocaleLowerCase();
      const b = el("button", { type: "button", class: `chip${active ? " active" : ""}`, "aria-pressed": String(active), dir: "auto" }, [
        el("span", { text: tr.term }),
        el("span", { class: "chip-count", text: numFmt.format(tr.sources) })
      ]);
      b.addEventListener("click", () => {
        state.q = active ? "" : tr.term;
        if (state.section === "local") state.section = "all";
        state.scope = "mine";
        $("search").value = state.q;
        state.shown = PAGE;
        renderAll();
        if (!active) $("latest").scrollIntoView();
      });
      return b;
    }));
  }

  function renderControls() {
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.section === state.section)));
    const isLocal = state.section === "local";
    $("local-note").hidden = !isLocal;
    $("scope-group").hidden = isLocal;
    document.querySelectorAll(".seg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scope === state.scope)));

    const lc = $("local-country");
    lc.hidden = !isLocal;
    if (isLocal) fillCountrySelect(lc, localCountries());

    const inScope = (state.data?.sources || []).filter(sourceInScope);

    // Leaning filter only where outlets carry a leaning label (currently Israel).
    const leanings = LEAN_ORDER.filter((l) => inScope.some((s) => s.leaning === l));
    const ls = $("leaning-filter");
    ls.hidden = leanings.length === 0;
    if (!leanings.includes(state.leaning)) state.leaning = "";
    ls.replaceChildren(el("option", { value: "", text: t("allLeanings") }), ...leanings.map((l) => el("option", { value: l, text: leanLabel(l) })));
    ls.value = state.leaning;
    ls.setAttribute("aria-label", t("allLeanings"));

    const sources = inScope
      .filter((s) => !state.leaning || s.leaning === state.leaning)
      .sort((a, b) => a.name.localeCompare(b.name, state.ui));
    if (state.source && !sources.some((s) => s.id === state.source)) state.source = "";
    const sel = $("source-filter");
    sel.replaceChildren(el("option", { value: "", text: t("allSources") }), ...sources.map((s) => el("option", { value: s.id, text: s.name })));
    sel.value = state.source;
    sel.setAttribute("aria-label", t("allSources"));
  }

  function storyCard(a) {
    const s = src(a.sourceId);
    const url = safeUrl(a.url);
    const isDemo = !!state.data?.demo;
    const titleNode = url
      ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: a.title })
      : el("span", { text: a.title });
    const uiDir = I18N[state.ui].dir;
    return el("article", { class: "story-card", lang: a.lang, dir: I18N[a.lang]?.dir || "auto" }, [
      el("div", { class: "story-meta" }, [
        el("span", { class: "story-source", text: s.name }),
        el("span", { class: "badges", lang: state.ui, dir: uiDir }, [
          s.leaning ? leanBadge(s.leaning) : null,
          isDemo
            ? el("span", { class: "lang-badge demo-badge", text: "DEMO" })
            : el("span", { class: "lang-badge", text: langName(a.lang) })
        ])
      ]),
      el("h3", {}, titleNode),
      a.excerpt ? el("p", { class: "story-summary", text: a.excerpt }) : null,
      el("div", { class: "story-footer", lang: state.ui, dir: uiDir }, [
        el("time", { datetime: a.publishedAt || a.fetchedAt || "", title: a.publishedAt ? absTime(a.publishedAt) : null, text: relTime(a.publishedAt || a.fetchedAt) }),
        url ? el("a", { class: "read-link", href: url, target: "_blank", rel: "noopener noreferrer", text: t("readAt", { source: s.name }) }) : null
      ])
    ]);
  }

  function renderStories() {
    const list = filtered();
    $("stories").replaceChildren(...list.slice(0, state.shown).map(storyCard));
    const empty = $("empty");
    empty.hidden = list.length > 0;
    empty.textContent = t("noResults");
    $("more").hidden = list.length <= state.shown;
  }

  function renderCompare() {
    const section = $("compare");
    const leaned = (state.data?.articles || []).filter((a) => src(a.sourceId).leaning);
    section.hidden = !(state.data?.sources || []).some((s) => s.leaning);
    if (section.hidden) return;
    const uiDir = I18N[state.ui].dir;
    $("compare-grid").replaceChildren(...COMPARE_COLS.map((col) => {
      const pool = leaned
        .filter((a) => col.leanings.includes(src(a.sourceId).leaning) && matchesQuery(a))
        .sort((a, b) => timeOf(b) - timeOf(a));
      // Mix outlets: at most two headlines per outlet unless the column would stay short.
      const perOutlet = new Map();
      const items = pool.filter((a) => {
        const n = (perOutlet.get(a.sourceId) || 0) + 1;
        perOutlet.set(a.sourceId, n);
        return n <= 2;
      }).slice(0, COMPARE_PER_COL);
      for (const a of pool) {
        if (items.length >= COMPARE_PER_COL) break;
        if (!items.includes(a)) items.push(a);
      }
      items.sort((a, b) => timeOf(b) - timeOf(a));
      return el("div", { class: `compare-col ${col.cls}` }, [
        el("h3", { text: t(col.key) }),
        ...(items.length ? items.map((a) => {
          const s = src(a.sourceId);
          const url = safeUrl(a.url);
          return el("div", { class: "compare-item" }, [
            el(url ? "a" : "span", { class: "headline", href: url, target: url ? "_blank" : null, rel: url ? "noopener noreferrer" : null, lang: a.lang, dir: I18N[a.lang]?.dir || "auto", text: a.title }),
            el("div", { class: "compare-meta", lang: state.ui, dir: uiDir }, [
              el("span", { dir: "auto", text: s.name }),
              leanBadge(s.leaning),
              el("time", { datetime: a.publishedAt || a.fetchedAt || "", text: relTime(a.publishedAt || a.fetchedAt) })
            ])
          ]);
        }) : [el("p", { class: "compare-empty", text: t("compareEmpty") })])
      ]);
    }));
  }

  function renderSources() {
    const list = (state.data?.sources || []).slice().sort((a, b) =>
      (a.lang === state.ui ? -1 : 0) - (b.lang === state.ui ? -1 : 0) ||
      (a.section === b.section ? 0 : a.section === "world" ? -1 : 1) ||
      String(a.country).localeCompare(String(b.country)) || a.name.localeCompare(b.name));
    $("source-list").replaceChildren(...list.map((s) => {
      const home = safeUrl(s.home);
      const name = home ? el("a", { href: home, target: "_blank", rel: "noopener noreferrer", text: s.name }) : el("span", { text: s.name });
      const bits = [langName(s.lang)];
      if (s.country) bits.push(countryName(s.country));
      if (s.leaning) bits.push(leanLabel(s.leaning));
      if (s.via === "google-news") bits.push(t("viaGoogleNews"));
      bits.push(s.ok ? t("sourceOk") : t("sourceDown"));
      return el("div", { class: `source-item${s.ok ? "" : " down"}`, title: s.ok ? null : (s.error || "") }, [
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("span", { class: "name", dir: "auto" }, name),
        el("span", { class: "state", text: bits.join(" · ") })
      ]);
    }));
  }

  function renderAll() {
    renderStats();
    renderSearchTrends();
    renderTrends();
    renderControls();
    renderStories();
    renderCompare();
    renderSources();
  }

  function decideScope() {
    if (state.scope) return;
    const hasMine = (state.data?.articles || []).some((a) => a.lang === state.ui);
    state.scope = hasMine && !state.data?.demo ? "mine" : "all";
  }

  async function load(initial) {
    if (initial) $("stories").replaceChildren(el("p", { class: "empty", text: t("loading") }));
    try {
      const bucket = Math.floor(Date.now() / 300000); // cache-bust every 5 minutes
      const res = await fetch(`data/news.json?v=${bucket}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.articles)) throw new Error("bad data");
      state.data = data;
      sourceMap = Object.fromEntries((data.sources || []).map((s) => [s.id, s]));
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
  const resetPaging = () => { state.shown = PAGE; };
  const setCountry = (code) => { state.country = code; store.set("wr-country", code); };

  $("locale").addEventListener("change", (e) => {
    state.ui = e.target.value;
    store.set("wr-lang", state.ui);
    const url = new URL(location.href);
    url.searchParams.set("lang", state.ui);
    history.replaceState(null, "", url);
    state.scope = null;
    state.source = "";
    resetPaging();
    applyLocale();
    if (state.data) { decideScope(); renderAll(); }
  });

  let searchTimer;
  $("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value;
      resetPaging();
      renderTrends();
      renderStories();
      renderCompare();
    }, 180);
  });

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    state.section = b.dataset.section;
    state.source = "";
    resetPaging();
    renderControls();
    renderStories();
  }));

  document.querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => {
    state.scope = b.dataset.scope;
    resetPaging();
    renderControls();
    renderStories();
  }));

  $("local-country").addEventListener("change", (e) => {
    setCountry(e.target.value);
    state.source = "";
    resetPaging();
    renderControls();
    renderStories();
    renderSearchTrends();
  });

  $("trends-country").addEventListener("change", (e) => {
    setCountry(e.target.value);
    renderSearchTrends();
    if (state.section === "local") { renderControls(); renderStories(); }
  });

  $("leaning-filter").addEventListener("change", (e) => {
    state.leaning = e.target.value;
    resetPaging();
    renderControls();
    renderStories();
  });

  $("source-filter").addEventListener("change", (e) => {
    state.source = e.target.value;
    resetPaging();
    renderStories();
  });

  $("more").addEventListener("click", () => {
    state.shown += PAGE;
    renderStories();
  });

  applyLocale();
  load(true);
  setInterval(() => { if (!document.hidden) load(false); }, REFRESH_MS);
  setInterval(() => { if (state.data && !document.hidden) renderStats(); }, 60000);
})();
