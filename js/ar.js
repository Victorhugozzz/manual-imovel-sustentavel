/* =========================================================
   ar.js — Qualidade do ar (Open-Meteo / CAMS) + mapa Windy
   ========================================================= */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);

  const LEVELS = [
    { max: 50, label: "Boa", color: "#3faa4b", advice: "Ar limpo. Ótimo para abrir as janelas e ventilar a casa." },
    { max: 100, label: "Moderada", color: "#d9b52a", advice: "Aceitável. Pessoas muito sensíveis podem sentir algum desconforto." },
    { max: 150, label: "Ruim para grupos sensíveis", color: "#f08a24", advice: "Crianças, idosos e pessoas com problemas respiratórios devem evitar esforço ao ar livre." },
    { max: 200, label: "Ruim", color: "#d9473b", advice: "Prefira ventilar a casa em horários de menor poluição e evite atividades externas intensas." },
    { max: 300, label: "Muito ruim", color: "#8e44ad", advice: "Mantenha as janelas fechadas nos horários críticos." },
    { max: Infinity, label: "Péssima", color: "#7a1f2b", advice: "Evite exposição ao ar livre." },
  ];
  const levelOf = (v) => LEVELS.find((l) => v <= l.max);

  const POLL = [
    ["pm2_5", "PM2.5", "µg/m³"],
    ["pm10", "PM10", "µg/m³"],
    ["ozone", "O₃", "µg/m³"],
    ["nitrogen_dioxide", "NO₂", "µg/m³"],
    ["sulphur_dioxide", "SO₂", "µg/m³"],
    ["carbon_monoxide", "CO", "µg/m³"],
  ];

  // Limpa tudo o que veio do local anterior antes de mostrar o novo (ou o erro)
  function resetAir(label, advice = "") {
    $("#aqiVal").textContent = "--";
    $("#aqiLabel").textContent = label;
    $("#aqiLabel").style.removeProperty("--lvl");
    $("#aqiAdvice").textContent = advice;
    $("#aqiArc").style.strokeDashoffset = "";
    $("#aqiArc").style.stroke = "";
    $("#aqiNeedle").style.transform = "";
    $("#pollutants").innerHTML = "";
    $("#aqiSpark").innerHTML = "";
    $("#aqiTime").textContent = "--";
  }

  let ctrl;
  async function loadAir(lat, lon) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    resetAir("Carregando dados…");
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: ["us_aqi", ...POLL.map((p) => p[0])].join(","),
      hourly: "us_aqi",
      forecast_days: "3",
      timezone: "auto",
    });
    try {
      const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch (err) {
      if (err.name === "AbortError") return;
      resetAir("Dados indisponíveis no momento", "Verifique sua conexão com a internet ou consulte o mapa do Windy ao lado.");
    }
  }

  function render(data) {
    const cur = data.current || {};
    const aqi = Math.round(cur.us_aqi ?? NaN);
    if (!Number.isFinite(aqi)) {
      resetAir("Sem dados para este ponto", "O serviço não tem medição para este local. Tente uma cidade próxima.");
      return;
    }
    const lvl = levelOf(aqi);
    $("#aqiVal").textContent = aqi;
    $("#aqiLabel").textContent = `Qualidade do ar: ${lvl.label}`;
    $("#aqiLabel").style.setProperty("--lvl", lvl.color); // cor só na bolinha; o texto fica escuro (contraste)
    $("#aqiAdvice").textContent = lvl.advice;

    const frac = Math.min(aqi / 300, 1);
    const arc = $("#aqiArc");
    arc.style.strokeDashoffset = String(251.3 * (1 - frac));
    arc.style.stroke = lvl.color;
    $("#aqiNeedle").style.transform = `rotate(${-90 + 180 * frac}deg)`;

    $("#pollutants").innerHTML = POLL.map(([k, name, unit]) => {
      const v = cur[k];
      const txt = typeof v === "number" ? fmt.num(v, v < 10 ? 1 : 0) : "--";
      return `<div><dt>${name}</dt><dd>${txt} <small>${unit}</small></dd></div>`;
    }).join("");

    if (cur.time) {
      const [d, t] = cur.time.split("T");
      $("#aqiTime").textContent = `${d.split("-").reverse().join("/")} ${t} (hora local)`;
    }
    drawSpark(data.hourly?.us_aqi || [], data.hourly?.time || [], cur.time);
  }

  function drawSpark(values, times, nowStr) {
    const svg = $("#aqiSpark");
    const W = 300, H = 70;
    const startIdx = Math.max(times.indexOf(nowStr?.slice(0, 13) + ":00"), 0);
    const vals = values.slice(startIdx, startIdx + 72).map((v) => (typeof v === "number" ? v : null));
    if (!vals.length) { svg.innerHTML = ""; return; }
    const max = Math.max(60, ...vals.filter((v) => v !== null)) * 1.1;
    const x = (i) => (i / Math.max(vals.length - 1, 1)) * W;
    const y = (v) => H - 4 - (v / max) * (H - 10);

    let path = "", area = "";
    vals.forEach((v, i) => {
      if (v === null) return;
      path += `${path ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    });
    area = `${path} L${x(vals.length - 1)} ${H} L0 ${H}Z`;
    let bands = "";
    [50, 100, 150].forEach((lim) => {
      if (lim < max) bands += `<line x1="0" x2="${W}" y1="${y(lim)}" y2="${y(lim)}" stroke="${levelOf(lim + 1).color}" stroke-dasharray="3 4" opacity=".6"/>`;
    });
    // marcadores de dia
    let days = "";
    for (let i = 24; i < vals.length; i += 24) days += `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" stroke="#d6dcc8"/>`;
    svg.innerHTML = `${days}${bands}<path d="${area}" fill="#3f7a43" opacity=".12"/><path d="${path}" fill="none" stroke="#2f6537" stroke-width="2"/>`;
  }

  /* ---------- Windy ---------- */
  let windyLoaded = false;
  function windySrc(lat, lon) {
    const p = new URLSearchParams({
      type: "map", location: "coordinates", metricRain: "mm", metricTemp: "°C", metricWind: "km/h",
      zoom: "8", overlay: "wind", product: "ecmwf", level: "surface",
      lat: lat.toFixed(3), lon: lon.toFixed(3), detailLat: lat.toFixed(3), detailLon: lon.toFixed(3),
      marker: "true", message: "true",
    });
    return `https://embed.windy.com/embed.html?${p}`;
  }
  function updateWindy(force) {
    $("#lnkWindy").href = `https://www.windy.com/-PM2.5-pm2p5?cams,pm2p5,${Loc.lat.toFixed(3)},${Loc.lon.toFixed(3)},9`;
    if (windyLoaded || force) {
      $("#windyFrame").src = windySrc(Loc.lat, Loc.lon);
      windyLoaded = true;
    }
  }

  document.addEventListener("tool:shown", (e) => {
    if (e.detail === "ar" && !windyLoaded) updateWindy(true);
  });
  document.addEventListener("loc:change", (e) => {
    loadAir(e.detail.lat, e.detail.lon);
    updateWindy(false);
  });

  // carregado sob demanda: a aba "Qualidade do ar" pode já estar aberta (link …/#ar)
  updateWindy(!$("#ar").hidden);
  loadAir(Loc.lat, Loc.lon);
})();
