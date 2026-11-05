/* =========================================================
   sol.js — Sol & Terra: mapa de satélite + trajetória solar
   Depende de: Leaflet (L), SunCalc, window.Loc
   ========================================================= */
(() => {
  "use strict";
  if (typeof SunCalc === "undefined") return;

  const $ = (s) => document.querySelector(s);
  const DEG = 180 / Math.PI;
  const DIRS = [
    { k: "N", az: 0, nome: "Norte" }, { k: "NE", az: 45, nome: "Nordeste" }, { k: "L", az: 90, nome: "Leste" },
    { k: "SE", az: 135, nome: "Sudeste" }, { k: "S", az: 180, nome: "Sul" }, { k: "SO", az: 225, nome: "Sudoeste" },
    { k: "O", az: 270, nome: "Oeste" }, { k: "NO", az: 315, nome: "Noroeste" },
  ];

  const savedFacade = AppStore.get("mis-facade", "N");
  const state = {
    date: null,          // "YYYY-MM-DD"
    minutes: 720,        // minutos desde 00:00 no horário local do imóvel
    tzFmt: null,         // Intl.DateTimeFormat do fuso do local (null = fuso do navegador)
    tzFixed: null,       // deslocamento fixo (s) quando o navegador não conhece o fuso
    touched: false,      // o usuário já escolheu data/hora
    facade: DIRS.some((d) => d.k === savedFacade) ? savedFacade : "N",
  };

  /* ---------- Tempo no fuso do local ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const offsetCache = new Map();
  // Deslocamento (s) do fuso do local num instante — considera horário de verão
  function offsetAt(ms) {
    if (state.tzFmt) {
      const hour = Math.floor(ms / 3600000);
      if (!offsetCache.has(hour)) {
        const name = state.tzFmt.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName").value;
        const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/); // "GMT-03:00" ou "GMT"
        offsetCache.set(hour, m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3] || 0) * 60) : 0);
      }
      return offsetCache.get(hour);
    }
    if (state.tzFixed !== null) return state.tzFixed;
    return -new Date(ms).getTimezoneOffset() * 60;
  }
  function setTimezone(name, fixedOffset) {
    offsetCache.clear();
    state.tzFmt = null;
    state.tzFixed = null;
    try {
      state.tzFmt = new Intl.DateTimeFormat("en-US", { timeZone: name, timeZoneName: "longOffset" });
    } catch {
      if (Number.isFinite(fixedOffset)) state.tzFixed = fixedOffset;
    }
  }
  function todayLocal() {
    const now = Date.now();
    const d = new Date(now + offsetAt(now) * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function nowMinutesLocal() {
    const now = Date.now();
    const d = new Date(now + offsetAt(now) * 1000);
    return Math.round((d.getUTCHours() * 60 + d.getUTCMinutes()) / 5) * 5;
  }
  function toInstant(dateStr, minutes) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const wall = Date.UTC(y, m - 1, d) + minutes * 60000;
    let t = wall - offsetAt(wall) * 1000;
    t = wall - offsetAt(t) * 1000; // 2ª passada acerta a virada do horário de verão
    return new Date(t);
  }
  function fmtTime(date) {
    if (!date || isNaN(date)) return "--:--";
    const d = new Date(date.getTime() + offsetAt(date.getTime()) * 1000);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  function tzLabel() {
    const off = offsetAt(toInstant(state.date, state.minutes).getTime());
    const h = Math.floor(Math.abs(off) / 3600), min = Math.round((Math.abs(off) % 3600) / 60);
    return `UTC${off < 0 ? "−" : "+"}${h}${min ? `:${pad(min)}` : ""}`;
  }
  const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(Math.round(m % 60))}`;

  // SunCalc: azimute a partir do Sul, positivo para Oeste → bússola (0 = Norte, horário)
  function sunPos(date, lat, lon) {
    const p = SunCalc.getPosition(date, lat, lon);
    return { alt: p.altitude * DEG, az: (p.azimuth * DEG + 180 + 360) % 360 };
  }
  const compassName = (az) => DIRS[Math.round(az / 45) % 8].k;

  let tzRequest = 0;
  async function refreshTimezone(lat, lon) {
    const id = ++tzRequest;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&current=temperature_2m`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (id !== tzRequest) return; // já existe uma busca mais nova (local trocado)
      if (typeof data.timezone === "string") setTimezone(data.timezone, data.utc_offset_seconds);
      if (!state.touched) syncToNow();
    } catch { /* offline: mantém fuso do navegador */ }
  }

  /* ---------- Mapa (Leaflet) ---------- */
  let map, marker, rays;
  function initMap() {
    const offline = $("#mapOffline");
    if (typeof L === "undefined") {
      offline.textContent = "Não foi possível carregar o mapa. Os cálculos de sol abaixo continuam funcionando.";
      offline.hidden = false;
      return;
    }
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([Loc.lat, Loc.lon], 16);

    const satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imagens © Esri, Maxar, Earthstar Geographics",
    });
    const rotulos = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Rótulos © Esri",
    });
    const ruas = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO",
    });
    [satelite, ruas].forEach((layer) => {
      layer.on("tileerror", () => { offline.hidden = false; });
      layer.on("tileload", () => { offline.hidden = true; });
    });
    satelite.addTo(map);
    rotulos.addTo(map);
    L.control.layers({ "Satélite": satelite, "Ruas": ruas }, { "Rótulos": rotulos }, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: '<div class="house-pin"><svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg></div>',
      iconSize: [30, 30], iconAnchor: [15, 36],
    });
    marker = L.marker([Loc.lat, Loc.lon], { draggable: true, icon, title: "Arraste para o imóvel" }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      Loc.set(p.lat, p.lng, "Ponto no mapa");
    });
    map.on("click", (e) => Loc.set(e.latlng.lat, e.latlng.lng, "Ponto no mapa"));
    map.on("zoomend moveend", drawRays);

    rays = L.layerGroup().addTo(map);
  }

  // Linhas de nascer, pôr e posição atual do sol saindo do imóvel (estilo SunCalc)
  function drawRays() {
    if (!map || !rays) return;
    rays.clearLayers();
    const origin = map.latLngToContainerPoint([Loc.lat, Loc.lon]);
    const len = Math.min(map.getSize().x, map.getSize().y) * 0.38;
    const ray = (az, color, weight, dash) => {
      const rad = az / DEG;
      const end = L.point(origin.x + Math.sin(rad) * len, origin.y - Math.cos(rad) * len);
      L.polyline([map.containerPointToLatLng(origin), map.containerPointToLatLng(end)], {
        color, weight, dashArray: dash, opacity: .95, interactive: false,
      }).addTo(rays);
    };
    const t = SunCalc.getTimes(toInstant(state.date, 720), Loc.lat, Loc.lon);
    if (!isNaN(t.sunrise)) ray(sunPos(t.sunrise, Loc.lat, Loc.lon).az, "#ffb02e", 4);
    if (!isNaN(t.sunset)) ray(sunPos(t.sunset, Loc.lat, Loc.lon).az, "#e5533d", 4);
    const now = sunPos(toInstant(state.date, state.minutes), Loc.lat, Loc.lon);
    if (now.alt > 0) ray(now.az, "#fff36b", 3, "6 6");
    // Normal da fachada
    const f = DIRS.find((d) => d.k === state.facade);
    ray(f.az, "#9fe39a", 3, "2 7");
  }

  /* ---------- Diagrama polar ---------- */
  const C = 160, R = 128;
  function polar(az, alt) {
    const r = R * (1 - Math.max(alt, 0) / 90);
    const a = az / DEG;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  }
  function dayPath(dateStr) {
    const pts = [];
    for (let m = 0; m <= 1440; m += 6) {
      const p = sunPos(toInstant(dateStr, m), Loc.lat, Loc.lon);
      if (p.alt > 0) pts.push(polar(p.az, p.alt));
      else if (pts.length && pts[pts.length - 1] !== null) pts.push(null);
    }
    let d = "", pen = false;
    pts.forEach((p) => {
      if (!p) { pen = false; return; }
      d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
      pen = true;
    });
    return d;
  }
  function solstices() {
    const y = state.date.slice(0, 4);
    return { jun: `${y}-06-21`, dez: `${y}-12-21` };
  }

  function drawCompass() {
    const svg = $("#sunCompass");
    const s = solstices();
    const f = DIRS.find((d) => d.k === state.facade);
    const now = sunPos(toInstant(state.date, state.minutes), Loc.lat, Loc.lon);
    const t = SunCalc.getTimes(toInstant(state.date, 720), Loc.lat, Loc.lon);

    let o = `<defs><radialGradient id="cg"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#eef2e2"/></radialGradient></defs>`;
    o += `<circle cx="${C}" cy="${C}" r="${R}" fill="url(#cg)" stroke="#bfcfb0" stroke-width="1.5"/>`;
    [30, 60].forEach((alt) => {
      o += `<circle cx="${C}" cy="${C}" r="${R * (1 - alt / 90)}" fill="none" stroke="#d7e0cb" stroke-dasharray="3 4"/>`;
      o += `<text x="${C + 3}" y="${C - R * (1 - alt / 90) + 11}" font-size="8.5" fill="#6b786c">${alt}°</text>`;
    });
    for (let a = 0; a < 360; a += 45) {
      const [x, y] = polar(a, 0);
      o += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="#e1e7d6"/>`;
    }
    // fachada: semicírculo iluminável + casa girada
    const fa = f.az;
    const arc = (a0, a1) => {
      const [x0, y0] = polar(a0, 0), [x1, y1] = polar(a1, 0);
      return `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}Z`;
    };
    o += `<path d="${arc(fa - 90, fa + 90)}" fill="#f2b844" opacity=".12"/>`;
    o += `<g transform="rotate(${fa} ${C} ${C})">
            <rect x="${C - 18}" y="${C - 14}" width="36" height="28" rx="3" fill="#2f6537"/>
            <path d="M${C - 18} ${C - 14} h36" stroke="#f2b844" stroke-width="4"/>
            <path d="M${C} ${C - 18} v-34 m-6 8 l6 -8 6 8" stroke="#2f6537" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          </g>`;
    // trajetórias de referência (solstícios)
    o += `<path d="${dayPath(s.jun)}" fill="none" stroke="#6fa8b4" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    o += `<path d="${dayPath(s.dez)}" fill="none" stroke="#e5533d" stroke-width="1.6" stroke-dasharray="5 4" opacity=".75"/>`;
    // trajetória do dia
    o += `<path d="${dayPath(state.date)}" fill="none" stroke="#f2b844" stroke-width="4" stroke-linecap="round"/>`;
    if (!isNaN(t.sunrise)) {
      const [x, y] = polar(sunPos(t.sunrise, Loc.lat, Loc.lon).az, 0);
      o += `<circle cx="${x}" cy="${y}" r="5" fill="#ffb02e" stroke="#fff" stroke-width="2"/>`;
    }
    if (!isNaN(t.sunset)) {
      const [x, y] = polar(sunPos(t.sunset, Loc.lat, Loc.lon).az, 0);
      o += `<circle cx="${x}" cy="${y}" r="5" fill="#e5533d" stroke="#fff" stroke-width="2"/>`;
    }
    if (now.alt > 0) {
      const [x, y] = polar(now.az, now.alt);
      o += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="#f2b844" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      o += `<circle cx="${x}" cy="${y}" r="13" fill="#f2b844" opacity=".3"/><circle cx="${x}" cy="${y}" r="8" fill="#f2b844" stroke="#fff" stroke-width="2.5"/>`;
    }
    // rótulos cardeais
    [["N", 0], ["L", 90], ["S", 180], ["O", 270]].forEach(([k, a]) => {
      const r = R + 16, rad = a / DEG;
      o += `<text x="${C + r * Math.sin(rad)}" y="${C - r * Math.cos(rad) + 5}" text-anchor="middle" font-family="Fraunces, serif" font-weight="800" font-size="15" fill="${k === "N" ? "#c0392b" : "#163a21"}">${k}</text>`;
    });
    // legenda
    o += `<g font-size="9" fill="#586859" font-family="DM Sans, sans-serif">
            <line x1="6" y1="306" x2="22" y2="306" stroke="#f2b844" stroke-width="3"/><text x="26" y="335">dia escolhido</text>
            <line x1="100" y1="306" x2="116" y2="306" stroke="#6fa8b4" stroke-width="2" stroke-dasharray="4 3"/><text x="120" y="335">21/jun</text>
            <line x1="168" y1="306" x2="184" y2="306" stroke="#e5533d" stroke-width="2" stroke-dasharray="4 3"/><text x="188" y="335">21/dez</text>
            <rect x="236" y="327" width="10" height="10" fill="#f2b844" opacity=".3"/><text x="250" y="335">fachada</text>
          </g>`;
    svg.innerHTML = o;
  }

  /* ---------- Leituras ---------- */
  function updateReadout() {
    const noonRef = toInstant(state.date, 720);
    const t = SunCalc.getTimes(noonRef, Loc.lat, Loc.lon);
    const now = sunPos(toInstant(state.date, state.minutes), Loc.lat, Loc.lon);
    $("#rSunrise").textContent = fmtTime(t.sunrise);
    $("#rSunset").textContent = fmtTime(t.sunset);
    $("#rNoon").textContent = fmtTime(t.solarNoon);
    const dayMin = (t.sunset - t.sunrise) / 60000;
    $("#rDay").textContent = isNaN(dayMin) ? "--" : `${Math.floor(dayMin / 60)}h ${pad(Math.round(dayMin % 60))}min`;
    $("#rAlt").textContent = now.alt > 0 ? `${now.alt.toFixed(1).replace(".", ",")}°` : "abaixo do horizonte";
    $("#rAz").textContent = `${now.az.toFixed(0)}° (${compassName(now.az)})`;
    $("#sunTimeOut").textContent = fmtMin(state.minutes);
    $("#sunTime").setAttribute("aria-valuetext", fmtMin(state.minutes));
    $("#sunTz").textContent = `(hora local do imóvel, ${tzLabel()})`;

    const ymd = state.date.replace(/-/g, ".");
    $("#lnkSuncalc").href = `https://www.suncalc.org/#/${Loc.lat.toFixed(5)},${Loc.lon.toFixed(5)},17/${ymd}/${fmtMin(state.minutes)}/1/3`;
    $("#lnkEarth").href = `https://earth.google.com/web/@${Loc.lat.toFixed(6)},${Loc.lon.toFixed(6)},900a,700d,35y,0h,45t,0r`;
  }

  /* ---------- Análise da fachada ---------- */
  function facadeSun(dateStr, facadeAz) {
    const noon = SunCalc.getTimes(toInstant(dateStr, 720), Loc.lat, Loc.lon).solarNoon;
    let am = 0, pm = 0, start = null;
    const spans = []; // períodos contínuos de sol na fachada: [início, fim] em minutos
    for (let m = 0; m < 1440; m += 5) {
      const inst = toInstant(dateStr, m);
      const p = sunPos(inst, Loc.lat, Loc.lon);
      // ignora sol rasante (< 2°) e sol que só tangencia a fachada
      const lit = p.alt > 2 && Math.cos((p.az - facadeAz) / DEG) > 0.05;
      if (lit) {
        if (inst < noon) am += 5; else pm += 5;
        if (start === null) start = m;
      } else if (start !== null) {
        spans.push([start, m]);
        start = null;
      }
    }
    if (start !== null) spans.push([start, 1440]);
    return { am, pm, total: am + pm, spans };
  }

  const TIPS = {
    // textos para o Hemisfério Sul; no Norte o eixo N↔S é espelhado
    N: ["Excelente", "Recebe sol na maior parte do dia, com o sol mais baixo (e bem-vindo) no inverno e mais alto no verão — fácil de controlar com beirais. Ótima para salas e quartos."],
    NE: ["Excelente", "Sol da manhã o ano todo e boa parte do dia no inverno. Uma das orientações mais equilibradas no Brasil: ambientes iluminados sem calor excessivo à tarde."],
    L: ["Muito boa", "Sol da manhã, mais ameno. Indicada para quartos e cozinha. A tarde fica sombreada e fresca."],
    SE: ["Boa", "Sol apenas nas primeiras horas da manhã, sobretudo no verão. Ambientes frescos — bons para dormitórios em regiões quentes."],
    S: ["Atenção", "Pouco ou nenhum sol direto no inverno; no verão, só no início da manhã e fim da tarde. Tende a ser mais fria e úmida — verifique mofo. Boa para áreas de serviço e escritório."],
    SO: ["Atenção", "Sol do fim da tarde no verão, que aquece bastante, e pouca insolação no inverno. Vale prever proteção solar e boa ventilação."],
    O: ["Cuidado com o calor", "Sol da tarde, o mais quente do dia. Exige brises, beirais, toldos, vegetação ou vidros de controle solar para evitar superaquecimento."],
    NO: ["Cuidado com o calor", "Sol do meio-dia até o fim da tarde. Aquece bastante no verão — prefira com proteção solar; no inverno é agradável."],
  };
  const MIRROR = { N: "S", NE: "SE", L: "L", SE: "NE", S: "N", SO: "NO", O: "O", NO: "SO" };
  // Perto do Equador o sol cruza o zênite: Norte e Sul se comportam de forma parecida
  const TIP_EQUATOR_NS = ["Boa", "Recebe pouco sol direto, e só em parte do ano. Tende a ser uma fachada fresca."];

  function updateFacade() {
    const f = DIRS.find((d) => d.k === state.facade);
    const s = solstices();
    const today = facadeSun(state.date, f.az);
    const jun = facadeSun(s.jun, f.az);
    const dez = facadeSun(s.dez, f.az);
    const key = Loc.lat >= 0 ? MIRROR[f.k] : f.k;
    const nearEquator = Math.abs(Loc.lat) < 10;
    const [tag, txt] = nearEquator && (key === "N" || key === "S") ? TIP_EQUATOR_NS : TIPS[key];
    const h = (m) => (m ? `${Math.floor(m / 60)}h${pad(m % 60)}` : "0h");
    const spanTxt = ([a, b]) => `${fmtMin(a)}–${fmtMin(b)}`;
    const range = !today.spans.length ? "sem sol direto neste dia"
      : today.spans.length === 1 ? `das ${fmtMin(today.spans[0][0])} às ${fmtMin(today.spans[0][1])}`
      : `em ${today.spans.length} períodos: ${today.spans.map(spanTxt).join(" e ")}`;
    const equator = nearEquator ? "<p><b>Perto da Linha do Equador</b> o sol passa quase a pino: as fachadas Leste e Oeste são as mais expostas.</p>" : "";

    const html = `
      <h3>Fachada ${f.nome} (${f.k}) · ${tag}</h3>
      <p>No dia escolhido: <b>${h(today.total)}</b> de sol direto (${range}).</p>
      <div class="hours">
        <span>Manhã: <b>${h(today.am)}</b></span>
        <span>Tarde: <b>${h(today.pm)}</b></span>
        <span>21/jun: <b>${h(jun.total)}</b></span>
        <span>21/dez: <b>${h(dez.total)}</b></span>
      </div>
      <p>${txt}</p>${equator}`;
    // a região é aria-live: só reescreve quando o texto muda (o controle de hora não altera a análise)
    const box = $("#facadeResult");
    if (box.dataset.html !== html) {
      box.innerHTML = html;
      box.dataset.html = html;
    }
  }

  function renderFacadeButtons() {
    const box = $("#facadeBtns");
    box.innerHTML = "";
    const select = (b, d) => {
      state.facade = d.k;
      AppStore.set("mis-facade", d.k);
      [...box.children].forEach((c) => {
        c.setAttribute("aria-checked", String(c === b));
        c.tabIndex = c === b ? 0 : -1;
      });
      renderAll();
    };
    DIRS.forEach((d) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.k;
      b.title = d.nome;
      b.setAttribute("aria-label", d.nome);
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(d.k === state.facade));
      b.tabIndex = d.k === state.facade ? 0 : -1;
      b.addEventListener("click", () => select(b, d));
      box.appendChild(b);
    });
    // Padrão radiogroup: setas mudam a seleção e o foco
    box.addEventListener("keydown", (ev) => {
      const btns = [...box.children];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      const j = (i + step + btns.length) % btns.length;
      select(btns[j], DIRS[j]);
      btns[j].focus();
    });
  }

  function renderAll() {
    updateReadout();
    drawCompass();
    updateFacade();
    drawRays();
  }

  /* ---------- Controles ---------- */
  // Data e hora "de agora" no fuso do imóvel (refeito quando o fuso real chega da API)
  function syncToNow() {
    state.date = todayLocal();
    state.minutes = nowMinutesLocal();
    $("#sunDate").value = state.date;
    $("#sunTime").value = state.minutes;
  }

  function initControls() {
    syncToNow();
    const dateIn = $("#sunDate");
    const timeIn = $("#sunTime");

    dateIn.addEventListener("change", () => {
      if (!dateIn.value) return;
      state.date = dateIn.value;
      state.touched = true;
      renderAll();
    });
    timeIn.addEventListener("input", () => {
      state.minutes = Number(timeIn.value);
      state.touched = true;
      renderAll();
    });

    document.querySelectorAll("[data-qd]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.qd;
      // inverno e verão trocam de mês entre os hemisférios
      const south = Loc.lat < 0;
      const md = { winter: south ? "06-21" : "12-21", summer: south ? "12-21" : "06-21", equinox: "03-20" }[v];
      state.date = v === "today" ? todayLocal() : `${state.date.slice(0, 4)}-${md}`;
      state.touched = v !== "today";
      dateIn.value = state.date;
      renderAll();
    }));
  }

  /* ---------- Integração com o local compartilhado ---------- */
  document.addEventListener("loc:change", async (e) => {
    const { lat, lon, name } = e.detail;
    if (map) {
      marker.setLatLng([lat, lon]);
      const zoom = name === "Ponto no mapa" ? map.getZoom() : 15;
      map.setView([lat, lon], zoom);
    }
    renderAll();
    await refreshTimezone(lat, lon);
    renderAll();
  });

  document.addEventListener("tool:shown", (e) => {
    if (e.detail === "sol" && map) setTimeout(() => { map.invalidateSize(); drawRays(); }, 60);
  });

  initControls();
  initMap();
  renderFacadeButtons();
  renderAll();
  refreshTimezone(Loc.lat, Loc.lon).then(renderAll);
})();
