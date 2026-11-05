/* =========================================================
   main.js — navegação, checklist, abas, local compartilhado
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollBehavior = reducedMotion ? "auto" : "smooth";

  // Sem esta classe (JS bloqueado ou com erro) o conteúdo .reveal fica visível.
  // O que já está na tela recebe .in antes, para não piscar (o script é defer).
  function revealVisibleNow() {
    $$(".reveal:not(.in)").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.style.transition = "none"; // aparece já pronto, sem esmaecer
        el.classList.add("in");
        requestAnimationFrame(() => { el.style.transition = ""; });
      }
    });
  }
  revealVisibleNow();
  document.documentElement.classList.add("js");

  /* ---------- Armazenamento seguro ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
    },
  };
  window.AppStore = store;

  /* ---------- Formatação ---------- */
  window.fmt = {
    brl: (v, dec = 2) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: dec, maximumFractionDigits: dec }),
    num: (v, dec = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }),
  };

  /* ---------- Header: menu mobile + sombra ---------- */
  const header = $(".site-header");
  const nav = $("#mainNav");
  const toggle = $("#navToggle");

  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  }
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !nav.classList.contains("open")) return;
    setMenu(false);
    toggle.focus();
  });

  const toTop = $(".to-top");
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle("scrolled", y > 10);
    toTop.classList.toggle("show", y > 700);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Link ativo conforme a seção ---------- */
  const navLinks = $$("a", nav);
  const sections = navLinks.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => {
        const on = a.getAttribute("href") === `#${e.target.id}`;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => spy.observe(s));

  /* ---------- Animação de entrada ---------- */
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  $$(".reveal:not(.in)").forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    revealObs.observe(el);
  });

  /* ---------- Checklists (8 testes + check-lista) ---------- */
  const CHECK_KEY = "mis-checklist-v1";
  const checked = store.get(CHECK_KEY, {});

  const scoreMsgs = [
    [0, "Comece pela localização do imóvel."],
    [1, "Bom começo! Continue avaliando."],
    [40, "Metade do caminho — atenção ao sol e à ventilação."],
    [75, "Quase lá! Revise os itens que faltam."],
    [100, "Checklist completo. Ótima escolha consciente!"],
  ];

  function updateProgress() {
    // 8 testes
    const tests = $$('[data-check-group="testes"] input');
    const tDone = tests.filter((i) => i.checked).length;
    const tLine = $('[data-progress-for="testes"]');
    $(".bar span", tLine).style.width = `${(tDone / tests.length) * 100}%`;
    $("b", tLine).textContent = tDone;
    tests.forEach((i) => i.closest(".test-card").classList.toggle("checked", i.checked));

    // Check-lista completa
    const all = $$('[data-check-group="checklist"] input');
    const done = all.filter((i) => i.checked).length;
    const pct = Math.round((done / all.length) * 100);
    const card = $('[data-progress-for="checklist"]');
    $(".ring-fg", card).style.strokeDashoffset = String(314.16 * (1 - pct / 100));
    $(".score-txt strong", card).textContent = `${pct}%`;
    $(".score-msg", card).textContent = scoreMsgs.filter(([min]) => pct >= min).pop()[1];

    $$(".acc").forEach((acc) => {
      const boxes = $$("input", acc);
      const n = boxes.filter((i) => i.checked).length;
      const badge = $(".acc-c", acc);
      badge.textContent = `${n}/${boxes.length}`;
      badge.classList.toggle("done", n === boxes.length);
    });
  }

  $$("[data-check-group] input[data-key]").forEach((input) => {
    input.checked = Boolean(checked[input.dataset.key]);
    input.addEventListener("change", () => {
      checked[input.dataset.key] = input.checked;
      store.set(CHECK_KEY, checked);
      updateProgress();
    });
  });
  updateProgress();

  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Apagar todas as marcações dos 8 testes e da check-lista salvas neste navegador?")) return;
    $$("[data-check-group] input[data-key]").forEach((i) => { i.checked = false; });
    Object.keys(checked).forEach((k) => delete checked[k]);
    store.set(CHECK_KEY, checked);
    updateProgress();
  });

  // Imprimir: abre todos os grupos para sair completo no papel
  let openedForPrint = [];
  window.addEventListener("beforeprint", () => {
    openedForPrint = $$(".acc:not([open])");
    openedForPrint.forEach((d) => d.setAttribute("open", ""));
  });
  window.addEventListener("afterprint", () => openedForPrint.forEach((d) => d.removeAttribute("open")));
  $("#btnPrint").addEventListener("click", () => window.print());

  /* ---------- Abas das ferramentas ---------- */
  const tabs = $$(".tool-tabs .tab");
  function showTab(tab) {
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
      const panel = $(`#${t.getAttribute("aria-controls")}`);
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    document.dispatchEvent(new CustomEvent("tool:shown", { detail: tab.getAttribute("aria-controls") }));
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t)));
  // Padrão ARIA de abas: só a aba ativa entra no Tab; setas, Home e End trocam de aba
  function showTabFocus(tab) {
    showTab(tab);
    tab.focus();
  }
  $(".tool-tabs").addEventListener("keydown", (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    showTabFocus(tabs[(next + tabs.length) % tabs.length]);
  });

  // Links internos (#sol, #energia, #ar) abrem a aba correspondente
  const tabFor = (hash) => tabs.find((t) => `#${t.getAttribute("aria-controls")}` === hash);
  $$('a[href="#sol"], a[href="#energia"], a[href="#ar"]').forEach((a) => {
    a.addEventListener("click", (ev) => {
      const tab = tabFor(a.getAttribute("href"));
      if (!tab) return;
      ev.preventDefault();
      loadTools();
      showTab(tab);
      $("#ferramentas").scrollIntoView({ behavior: scrollBehavior });
    });
  });
  // …e também quando o endereço já chega com o hash (ex.: link compartilhado …/#energia)
  const openTabFromHash = (scroll = true) => {
    const tab = tabFor(location.hash);
    if (!tab) return;
    loadTools();
    showTab(tab);
    if (scroll) $("#ferramentas").scrollIntoView();
  };
  window.addEventListener("hashchange", () => openTabFromHash());
  // DOMContentLoaded vem depois de sol.js/ar.js, que escutam "tool:shown"; a rolagem
  // espera o "load" porque o painel estava oculto quando o navegador tentou ir ao #hash
  document.addEventListener("DOMContentLoaded", () => openTabFromHash(false));
  window.addEventListener("load", () => {
    if (!tabFor(location.hash)) return;
    $("#ferramentas").scrollIntoView({ behavior: "instant" });
    revealVisibleNow(); // quem chega por link direto vê a seção pronta
  });

  /* ---------- Local compartilhado entre as ferramentas ---------- */
  const DEFAULT_LOC = { lat: -19.922, lon: -43.936, name: "Belo Horizonte, MG" };
  const validLoc = (l) => l && Number.isFinite(l.lat) && Number.isFinite(l.lon)
    && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180 && typeof l.name === "string";
  const savedLoc = store.get("mis-loc", null);
  const Loc = {
    ...(validLoc(savedLoc) ? savedLoc : DEFAULT_LOC),
    set(lat, lon, name) {
      this.lat = Number(lat);
      this.lon = Number(lon);
      this.name = name || `${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}`;
      store.set("mis-loc", { lat: this.lat, lon: this.lon, name: this.name });
      renderLoc();
      document.dispatchEvent(new CustomEvent("loc:change", { detail: { lat: this.lat, lon: this.lon, name: this.name } }));
    },
  };
  window.Loc = Loc;

  function renderLoc() {
    $("#locLabel").textContent = Loc.name;
    $("#locCoords").textContent = `${Loc.lat.toFixed(4)}, ${Loc.lon.toFixed(4)}`;
  }
  renderLoc();

  // Busca de cidades (Open-Meteo Geocoding — gratuito, sem chave)
  const input = $("#locInput");
  const list = $("#locResults");
  let debounce;
  let lastCtrl;

  async function searchCity(q) {
    if (lastCtrl) lastCtrl.abort();
    lastCtrl = new AbortController();
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`;
    const res = await fetch(url, { signal: lastCtrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  // Padrão combobox: ↑/↓ percorrem as opções, Enter escolhe, Esc fecha
  const locLive = $("#locLive");
  let options = [];
  let active = -1;

  function setActive(i) {
    active = i;
    options.forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", options[i].id);
      options[i].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function closeList() {
    list.hidden = true;
    list.innerHTML = "";
    options = [];
    setActive(-1);
    input.setAttribute("aria-expanded", "false");
  }

  function chooseCity(r) {
    const uf = r.country_code === "BR" && r.admin1 ? `, ${r.admin1}` : r.country ? `, ${r.country}` : "";
    Loc.set(r.latitude, r.longitude, `${r.name}${uf}`);
    input.value = "";
    closeList();
  }

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { closeList(); return; }
    debounce = setTimeout(async () => {
      try {
        const results = await searchCity(q);
        closeList();
        if (!results.length) {
          locLive.textContent = "Nenhuma cidade encontrada.";
          showLocMsg(`Nenhuma cidade encontrada para “${q}”.`);
          return;
        }
        showLocMsg("");
        results.forEach((r, idx) => {
          const li = document.createElement("li");
          li.id = `loc-opt-${idx}`;
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", "false");
          const region = [r.admin1, r.country].filter(Boolean).join(" · ");
          li.innerHTML = `<b></b> <small></small>`;
          li.querySelector("b").textContent = r.name;
          li.querySelector("small").textContent = region;
          li.addEventListener("click", () => chooseCity(r));
          list.appendChild(li);
          options.push(li);
        });
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        locLive.textContent = `${results.length} cidades encontradas. Use as setas para escolher.`;
      } catch (err) {
        if (err.name === "AbortError") return;
        closeList();
        showLocMsg("Sem conexão com o serviço de busca de cidades.");
      }
    }, 300);
  });

  input.addEventListener("keydown", (ev) => {
    const n = options.length;
    if (ev.key === "ArrowDown" && n) { ev.preventDefault(); setActive((active + 1) % n); }
    else if (ev.key === "ArrowUp" && n) { ev.preventDefault(); setActive(active <= 0 ? n - 1 : active - 1); }
    else if (ev.key === "Escape" && !list.hidden) { ev.preventDefault(); closeList(); }
  });

  $("#locForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const li = options[active] || options[0];
    if (li) li.click();
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest("#locForm")) closeList(); });

  const geoBtn = $("#btnGeo");
  const locMsg = $("#locMsg");
  const showLocMsg = (txt) => { locMsg.textContent = txt; locMsg.hidden = !txt; };
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showLocMsg("Este navegador não informa a localização. Busque a cidade ou clique no mapa.");
      return;
    }
    showLocMsg("Localizando…");
    geoBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoBtn.disabled = false;
        showLocMsg("");
        // arredonda para ~1 km: a posição exata da pessoa não vai para os serviços externos nem fica salva
        const round = (v) => Math.round(v * 100) / 100;
        Loc.set(round(pos.coords.latitude), round(pos.coords.longitude), "Minha localização (aprox.)");
      },
      () => {
        geoBtn.disabled = false;
        showLocMsg("Não foi possível obter sua localização. Busque a cidade ou clique no mapa.");
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  });
  document.addEventListener("loc:change", () => showLocMsg(""));

  /* ---------- Ferramentas sob demanda ---------- */
  // Leaflet (~150 KB), SunCalc, o mapa de satélite e as APIs só carregam quando a seção se aproxima
  const TOOL_SCRIPTS = ["vendor/leaflet/leaflet.js", "vendor/suncalc.js", "js/sol.js", "js/energia.js", "js/ar.js"];
  let toolsRequested = false;
  function loadTools() {
    if (toolsRequested) return;
    toolsRequested = true;
    const addScripts = () => TOOL_SCRIPTS.forEach((src) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // executa na ordem da lista
      document.head.appendChild(s);
    });
    // o CSS do Leaflet precisa estar aplicado antes de o mapa ser criado
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/leaflet/leaflet.css";
    css.onload = addScripts;
    css.onerror = addScripts;
    document.head.appendChild(css);
  }
  const toolsObs = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    toolsObs.disconnect();
    loadTools();
  }, { rootMargin: "800px 0px" });
  toolsObs.observe($("#ferramentas"));

  /* ---------- Casa em 3D (Three.js carregado sob demanda) ---------- */
  const h3d = $("#casa-3d");
  const h3dStatus = $("#h3dStatus");
  const showCorte = (msg) => { h3dStatus.textContent = msg; $(".h3d-corte").open = true; };
  const hasWebGL = () => {
    try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); }
    catch { return false; }
  };
  const h3dObs = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    h3dObs.disconnect();
    if (!hasWebGL()) { showCorte("Este navegador não exibe 3D. Veja ao lado o corte que deu origem ao modelo."); return; }
    import("./casa3d.js").then((m) => m.init({
      container: $("#h3dCanvas"), markers: $("#h3dMarkers"), list: $("#h3dList"),
      hourInput: $("#h3dHour"), hourOut: $("#h3dHourOut"),
      seasonBtns: $$("[data-season]"), viewBtns: $$("[data-view]"), rotateBtn: $("#h3dRotate"),
      onReady: () => { h3dStatus.textContent = ""; },
    })).catch(() => showCorte("Não foi possível carregar o modelo 3D. Veja ao lado o corte que deu origem a ele."));
  }, { rootMargin: "600px 0px" });
  h3dObs.observe(h3d);

  /* ---------- Vídeo de fundo do início ---------- */
  const heroVideo = $("#heroVideo");
  const heroBtn = $("#heroVideoBtn");
  function setHeroBtn(playing) {
    heroBtn.setAttribute("aria-pressed", String(!playing));
    $("span", heroBtn).textContent = playing ? "Pausar vídeo" : "Reproduzir vídeo";
    $("use", heroBtn).setAttribute("href", playing ? "#i-pause" : "#i-play");
  }
  const playHero = () => heroVideo.play().then(() => setHeroBtn(true)).catch(() => setHeroBtn(false));
  heroBtn.hidden = false;
  heroBtn.addEventListener("click", () => {
    if (heroVideo.paused) playHero();
    else { heroVideo.pause(); setHeroBtn(false); }
  });
  // começa sozinho só em telas grandes, sem "economia de dados" e sem pedido de menos movimento;
  // no celular fica a imagem de capa e o botão (o vídeo tem 3,9 MB)
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  if (!reducedMotion && !saveData && window.matchMedia("(min-width: 768px)").matches) {
    window.addEventListener("load", playHero, { once: true });
  }

  /* ---------- Gráfico de custo em 10 anos (análise de valor) ---------- */
  function drawValueChart() {
    const svg = $("#valueChart");
    if (!svg) return;
    const W = 420, H = 260, pad = { l: 58, r: 14, t: 14, b: 34 };
    const years = Array.from({ length: 11 }, (_, i) => i);
    const trad = years.map((y) => 500000 + 630 * 12 * y);
    const sust = years.map((y) => 530000 + 150 * 12 * y);
    const min = 480000, max = 600000;
    const x = (i) => pad.l + (i / 10) * (W - pad.l - pad.r);
    const yv = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

    let out = "";
    for (let v = min; v <= max; v += 20000) {
      out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yv(v)}" y2="${yv(v)}" stroke="#e4e8da"/>`;
      out += `<text x="${pad.l - 8}" y="${yv(v) + 4}" text-anchor="end" font-size="10" fill="#6b786c">${(v / 1000).toFixed(0)} mil</text>`;
    }
    years.forEach((i) => {
      if (i % 2 === 0) out += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#6b786c">ano ${i}</text>`;
    });
    const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yv(v).toFixed(1)}`).join(" ");
    // área de economia entre as curvas após o cruzamento
    out += `<path d="${line(trad)} L${x(10)} ${yv(sust[10])} ${sust.slice().reverse().map((v, k) => `L${x(10 - k).toFixed(1)} ${yv(v).toFixed(1)}`).join(" ")}Z" fill="#2f6537" opacity=".07"/>`;
    out += `<path d="${line(trad)}" fill="none" stroke="#c9a36a" stroke-width="3" stroke-linecap="round"/>`;
    out += `<path d="${line(sust)}" fill="none" stroke="#2f6537" stroke-width="3" stroke-linecap="round"/>`;
    // ponto de equilíbrio: 30.000 / (480*12) ≈ 5,2 anos
    const be = 30000 / (480 * 12);
    const beV = 530000 + 150 * 12 * be;
    out += `<circle cx="${x(be)}" cy="${yv(beV)}" r="5" fill="#f2b844" stroke="#fff" stroke-width="2"/>`;
    out += `<text x="${x(be) + 8}" y="${yv(beV) + 18}" font-size="10.5" font-weight="700" fill="#163a21">empate em ~${be.toFixed(1).replace(".", ",")} anos</text>`;
    out += `<text x="${x(10) - 4}" y="${yv(trad[10]) - 8}" text-anchor="end" font-size="10.5" font-weight="700" fill="#8a6530">${fmt.brl(trad[10], 0)}</text>`;
    out += `<text x="${x(10) - 4}" y="${yv(sust[10]) + 16}" text-anchor="end" font-size="10.5" font-weight="700" fill="#2f6537">${fmt.brl(sust[10], 0)}</text>`;
    svg.innerHTML = out;
    // resumo em texto para leitores de tela (o SVG é role="img")
    svg.setAttribute("aria-label", `Gráfico do custo acumulado em 10 anos (compra mais contas). Imóvel tradicional: ${fmt.brl(trad[10], 0)}. `
      + `Imóvel sustentável: ${fmt.brl(sust[10], 0)}. Os custos se igualam em cerca de ${be.toFixed(1).replace(".", ",")} anos.`);
  }
  drawValueChart();
})();
