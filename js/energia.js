/* =========================================================
   energia.js — Simulador de consumo e energia solar
   ========================================================= */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const KEY = "mis-energia-v1";

  // [nome, potência W, qtd, horas/dia, dias/mês]
  const PRESETS = {
    tradicional: [
      ["Chuveiro elétrico", 5500, 1, 0.8, 30],
      ["Ar-condicionado 12.000 BTU", 1400, 1, 6, 25],
      ["Geladeira antiga (2 portas)", 250, 1, 10, 30],
      ["Lâmpadas incandescentes", 60, 10, 6, 30],
      ["TV", 150, 1, 6, 30],
      ["Ferro de passar", 1000, 1, 1, 8],
      ["Máquina de lavar", 500, 1, 1, 12],
      ["Computador", 200, 1, 5, 30],
    ],
    eficiente: [
      ["Aquecimento solar + chuveiro (apoio)", 5500, 1, 0.15, 30],
      ["Ventilação natural + ventilador", 100, 2, 6, 25],
      ["Geladeira selo Procel A", 120, 1, 10, 30],
      ["Lâmpadas LED", 9, 10, 4, 30],
      ["TV LED", 80, 1, 6, 30],
      ["Ferro de passar", 1000, 1, 1, 8],
      ["Máquina de lavar (selo A)", 400, 1, 1, 12],
      ["Notebook", 60, 1, 5, 30],
    ],
  };

  // Limites por coluna: potência (W), quantidade, horas/dia, dias/mês
  const LIMITS = [null, [0, 20000], [0, 50], [0, 24], [0, 31]];
  const clamp = (v, [min, max]) => Math.min(Math.max(v, min), max);
  const validRow = (r) => Array.isArray(r) && r.length === 5 && typeof r[0] === "string"
    && r.slice(1).every((v) => Number.isFinite(v));

  const tbody = $("#energyTable tbody");
  const saved = AppStore.get(KEY, null);
  let rows = Array.isArray(saved) && saved.every(validRow)
    ? saved.map((r) => [r[0], ...r.slice(1).map((v, i) => clamp(v, LIMITS[i + 1]))])
    : PRESETS.tradicional.map((r) => [...r]);

  const kwh = (r) => (r[1] * r[2] * r[3] * r[4]) / 1000;

  function save() { AppStore.set(KEY, rows); }

  // Rótulos com o nome do aparelho: "Horas por dia, Chuveiro elétrico" (o leitor de tela sabe de qual linha é)
  const COL_LABELS = ["Aparelho", "Potência em watts", "Quantidade", "Horas por dia", "Dias por mês"];
  function labelRow(tr, r) {
    const name = r[0] || "aparelho sem nome";
    tr.querySelectorAll("input").forEach((inp, col) => {
      inp.setAttribute("aria-label", col === 0 ? "Nome do aparelho" : `${COL_LABELS[col]}, ${name}`);
    });
    tr.querySelector(".del").setAttribute("aria-label", `Remover ${name}`);
  }

  function renderTable() {
    tbody.innerHTML = "";
    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" aria-label="Aparelho"></td>
        <td><input type="number" min="0" max="20000" step="1" aria-label="Potência em watts"></td>
        <td><input type="number" min="0" max="50" step="1" aria-label="Quantidade"></td>
        <td><input type="number" min="0" max="24" step="0.1" aria-label="Horas por dia"></td>
        <td><input type="number" min="0" max="31" step="1" aria-label="Dias por mês"></td>
        <td class="kwh"></td>
        <td><button type="button" class="del" aria-label="Remover aparelho"><svg class="ic"><use href="#i-x"/></svg></button></td>`;
      const inputs = tr.querySelectorAll("input");
      inputs.forEach((inp, col) => {
        inp.value = r[col];
        inp.addEventListener("input", () => {
          if (col === 0) { r[0] = inp.value; labelRow(tr, r); }
          else {
            const v = parseFloat(inp.value.replace(",", "."));
            r[col] = Number.isFinite(v) ? clamp(v, LIMITS[col]) : 0;
          }
          tr.querySelector(".kwh").textContent = `${fmt.num(kwh(r), 1)}`;
          save();
          compute();
        });
        // Ao sair do campo, mostra o valor que realmente entrou no cálculo (ex.: 30 h → 24)
        if (col > 0) inp.addEventListener("change", () => { inp.value = r[col]; });
      });
      tr.querySelector(".kwh").textContent = `${fmt.num(kwh(r), 1)}`;
      labelRow(tr, r);
      tr.querySelector(".del").addEventListener("click", () => {
        rows.splice(idx, 1);
        save();
        renderTable();
      });
      tbody.appendChild(tr);
    });
    compute();
  }

  let liveTimer;
  function compute() {
    const total = rows.reduce((s, r) => s + kwh(r), 0);
    const tarifa = Math.max(parseFloat($("#tarifa").value) || 0, 0) + Number($("#bandeira").value);
    const cost = total * tarifa;

    $("#eKwh").textContent = `${fmt.num(total, 0)} kWh`;
    $("#eCost").textContent = fmt.brl(cost);
    $("#eYear").textContent = `${fmt.brl(cost * 12, 0)} por ano`;
    // anuncia o total só quando a pessoa para de digitar
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      $("#eLive").textContent = `Consumo estimado ${fmt.num(total, 0)} kWh por mês. Conta de luz estimada ${fmt.brl(cost)}.`;
    }, 800);

    // Barras por aparelho
    const sorted = rows.map((r) => ({ name: r[0] || "Aparelho", v: kwh(r) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const max = sorted[0]?.v || 1;
    $("#eBars").innerHTML = sorted.map((s) => `
      <div class="bar-row">
        <span class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
        <span class="track"><span class="fill"></span></span>
        <span class="pct">${total ? Math.round((s.v / total) * 100) : 0}%</span>
      </div>`).join("");
    // largura pelo CSSOM: atributo style="" no HTML seria bloqueado pela CSP (ver _headers)
    $("#eBars").querySelectorAll(".fill").forEach((el, i) => { el.style.width = `${(sorted[i].v / max) * 100}%`; });

    // Energia solar
    const hsp = Math.max(parseFloat($("#hsp").value) || 0, 0.1);
    const custoKwp = Math.max(parseFloat($("#custoKwp").value) || 0, 0);
    const MIN_DISP = 50; // kWh — custo de disponibilidade (bifásico)
    const compensavel = Math.max(total - MIN_DISP, 0);
    const kwp = compensavel / (hsp * 30 * 0.8);
    const paineis = Math.ceil((kwp * 1000) / 550);
    const inv = kwp * custoKwp;
    const eco = compensavel * tarifa;
    const payback = eco > 0 ? inv / eco : Infinity;

    if (compensavel <= 0) {
      // abaixo do mínimo cobrado pela distribuidora não há o que compensar com painéis
      ["#sKwp", "#sPaineis", "#sInv", "#sEco"].forEach((id) => { $(id).textContent = "—"; });
      $("#sPay").textContent = `consumo até ${MIN_DISP} kWh: não compensa`;
      return;
    }
    $("#sKwp").textContent = `${fmt.num(kwp, 2)} kWp`;
    $("#sPaineis").textContent = `${paineis} painéis`;
    $("#sInv").textContent = fmt.brl(inv, 0);
    $("#sEco").textContent = `${fmt.brl(eco)} /mês`;
    $("#sPay").textContent = Number.isFinite(payback)
      ? `${fmt.num(payback / 12, 1)} anos (${Math.round(payback)} meses)`
      : "—";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  $("#btnAddRow").addEventListener("click", () => {
    rows.push(["Novo aparelho", 100, 1, 1, 30]);
    save();
    renderTable();
    const last = tbody.querySelector("tr:last-child input");
    if (last) { last.focus(); last.select(); }
  });

  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    rows = PRESETS[b.dataset.preset].map((r) => [...r]);
    document.querySelectorAll("[data-preset]").forEach((x) => x.classList.toggle("active", x === b));
    save();
    renderTable();
  }));

  ["#tarifa", "#bandeira", "#hsp", "#custoKwp"].forEach((id) => $(id).addEventListener("input", compute));

  renderTable();
})();
