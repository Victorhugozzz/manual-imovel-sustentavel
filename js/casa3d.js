/* =========================================================
   casa3d.js — modelo 3D da casa a partir do corte esquemático
   Módulo carregado por main.js só quando a seção #casa-3d se aproxima.
   Depende de: vendor/three (Three.js r170, MIT)

   Medidas tiradas do corte (img/corte-casa.webp) na escala
   1 px ≈ 3 cm; o modelo é o corte "extrudado" em profundidade,
   aberto na frente como uma maquete em corte.
   ========================================================= */
import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";

const DEG = Math.PI / 180;
const D = 9;            // profundidade da casa (m), eixo z
const BACK = -D / 2;    // parede do fundo; a frente (z = +D/2) fica aberta

// Pontos do corte em metros (x = largura, y = altura; piso térreo em y = 0)
const P = {
  wallL: -5.33, wallR: 5.33,     // paredes laterais
  eaveL: [-6.2, 5.5],            // beiral do telhado esquerdo
  ridge: [1.4, 8.7],             // ponto alto do telhado esquerdo
  roofRtop: [0.36, 7.0],         // início do telhado direito (abaixo do lanternim)
  eaveR: [6.06, 4.6],            // beiral do telhado direito
  slabY: 3.0,                    // laje do pavimento superior
  slabL: -7.74, slabR: 7.56,     // laje se estende para fora (marquises)
};
// altura de um telhado (definido por dois pontos) numa posição x
const roofY = (a, b, x) => a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);

/* ---------- Materiais ---------- */
function stripes(color1, color2, n = 8) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 8;
  const g = c.getContext("2d");
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? color1 : color2;
    g.fillRect((i * 64) / n, 0, 64 / n, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeMaterials() {
  const roofTex = stripes("#8d949a", "#6f767c");
  roofTex.repeat.set(1, 30);
  const panelTex = stripes("#1e3d5c", "#2b5277", 6);
  panelTex.repeat.set(4, 1);
  return {
    wall: new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.9 }),
    wallIn: new THREE.MeshStandardMaterial({ color: "#e9e4d8", roughness: 0.95 }),
    slab: new THREE.MeshStandardMaterial({ color: "#cfcac0", roughness: 0.85 }),
    floor: new THREE.MeshStandardMaterial({ color: "#bfb7a8", roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex, color: "#ffffff", metalness: 0.35, roughness: 0.5 }),
    roofUnder: new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: "#9fc4d6", transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }),
    frame: new THREE.MeshStandardMaterial({ color: "#3a3f44", roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 0.8 }),
    panel: new THREE.MeshStandardMaterial({ map: panelTex, color: "#ffffff", metalness: 0.5, roughness: 0.25 }),
    gravel: new THREE.MeshStandardMaterial({ color: "#9a9a92", roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: "#6f9a52", roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: "#5a4231", roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#4e8a4a", roughness: 0.9, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: "#3f7a3d", roughness: 0.9, flatShading: true }),
    lamp: new THREE.MeshStandardMaterial({ color: "#222222", roughness: 0.5 }),
  };
}

/* ---------- Construção da casa ---------- */
function buildHouse(M) {
  const house = new THREE.Group();
  const add = (mesh, shadow = true) => {
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    house.add(mesh);
    return mesh;
  };
  // caixa a partir dos limites [x0,x1] [y0,y1] [z0,z1]
  const box = (x0, x1, y0, y1, z0, z1, mat, shadow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return add(m, shadow);
  };
  // placa inclinada entre dois pontos do corte, com toda a profundidade
  const slope = (a, b, thick, z0, z1, mat) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, z1 - z0), mat);
    m.position.set((a[0] + b[0]) / 2 - Math.sin(ang) * thick / 2, (a[1] + b[1]) / 2 + Math.cos(ang) * thick / 2, (z0 + z1) / 2);
    m.rotation.z = ang;
    return add(m);
  };

  const { wallL, wallR, eaveL, ridge, roofRtop, eaveR, slabY, slabL, slabR } = P;
  const t = 0.2; // espessura das paredes

  // terreno: brita sob a casa e grama ao redor
  box(-9, 9, -0.35, -0.15, -D / 2 - 1.5, D / 2 + 1.5, M.gravel);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(26, 48), M.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.36;
  grass.receiveShadow = true;
  house.add(grass);

  // piso térreo e laje superior (com vão da escada junto ao fundo)
  box(wallL, wallR, -0.15, 0, BACK, D / 2, M.floor);
  const stairX0 = -0.5, stairX1 = 3.6, stairZ1 = BACK + 1.3;
  box(slabL, stairX0, slabY - 0.2, slabY, BACK, D / 2, M.slab);
  box(stairX1, slabR, slabY - 0.2, slabY, BACK, D / 2, M.slab);
  box(stairX0, stairX1, slabY - 0.2, slabY, stairZ1, D / 2, M.slab);

  // paredes laterais até encontrar cada telhado
  const hL = roofY(eaveL, ridge, wallL), hR = roofY(roofRtop, eaveR, wallR);
  box(wallL - t, wallL, 0, hL, BACK, D / 2, M.wall);
  box(wallR, wallR + t, 0, hR, BACK, D / 2, M.wall);

  // parede do fundo seguindo o perfil do corte, com a porta central
  const shape = new THREE.Shape();
  shape.moveTo(wallL, 0);
  shape.lineTo(wallL, hL);
  shape.lineTo(ridge[0] - 0.9, roofY(eaveL, ridge, ridge[0] - 0.9));
  shape.lineTo(roofRtop[0] + 0.15, roofY(eaveL, ridge, roofRtop[0] + 0.15));
  shape.lineTo(roofRtop[0] + 0.15, roofRtop[1]);
  shape.lineTo(wallR, hR);
  shape.lineTo(wallR, 0);
  shape.lineTo(wallL, 0);
  const door = new THREE.Path();
  door.moveTo(-0.9, 0.05); door.lineTo(0.2, 0.05); door.lineTo(0.2, 2.35); door.lineTo(-0.9, 2.35); door.lineTo(-0.9, 0.05);
  shape.holes.push(door);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), M.wallIn);
  back.position.z = BACK - t;
  add(back);
  box(-0.9, 0.2, 0.05, 2.35, BACK - t / 2 - 0.02, BACK - t / 2 + 0.02, M.wood); // folha da porta

  // telhados: esquerdo (sobe até o lanternim) e direito (com placas solares)
  const roofZ0 = BACK - 0.6, roofZ1 = D / 2 + 0.6;
  // faces da caixa: +x, −x, +y (telha), −y (forro, mais claro), +z, −z
  const roofMats = [M.roof, M.roof, M.roof, M.roofUnder, M.roof, M.roof];
  slope(eaveL, ridge, 0.18, roofZ0, roofZ1, roofMats);
  slope(roofRtop, eaveR, 0.18, roofZ0, roofZ1, roofMats);

  // lanternim: faixa de vidro entre os dois telhados (luz e saída de ar quente)
  const clX = roofRtop[0] + 0.15;
  const clY0 = roofRtop[1] + 0.18, clY1 = roofY(eaveL, ridge, clX) - 0.05;
  box(clX - 0.03, clX + 0.03, clY0, clY1, BACK, D / 2, M.glass, false);
  for (let z = BACK; z <= D / 2 + 0.01; z += 1.5) box(clX - 0.05, clX + 0.05, clY0, clY1, z - 0.04, z + 0.04, M.frame);

  // placas fotovoltaicas sobre o telhado direito
  const panels = new THREE.Group();
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const s0 = 1.0 + row * 1.2, s1 = s0 + 1.1;           // posição ao longo da água do telhado (m)
      const ang = Math.atan2(eaveR[1] - roofRtop[1], eaveR[0] - roofRtop[0]);
      const len = s1 - s0;
      const cx = roofRtop[0] + Math.cos(ang) * (s0 + len / 2) - Math.sin(ang) * 0.24;
      const cy = roofRtop[1] + Math.sin(ang) * (s0 + len / 2) + Math.cos(ang) * 0.24;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 1.7), M.panel);
      m.position.set(cx, cy, -3.6 + col * 1.8);
      m.rotation.z = ang;
      m.castShadow = true;
      panels.add(m);
    }
  }
  house.add(panels);

  // janelas (vidro + caixilho) nas paredes laterais, como no corte
  const windowOn = (x, y0, y1, z0, z1) => {
    box(x - 0.12, x + 0.12, y0, y1, z0, z1, M.frame);
    box(x - 0.14, x + 0.14, y0 + 0.06, y1 - 0.06, z0 + 0.06, z1 - 0.06, M.glass, false);
  };
  windowOn(wallL - t / 2, 3.75, 5.2, -1.4, 0.2);         // janela do pavimento superior (esquerda)
  windowOn(wallL - t / 2, 0.9, 2.3, 1.2, 3.0);           // janela do térreo (esquerda)
  for (let i = 0; i < 3; i++) windowOn(wallR + t / 2, 3.75, 4.35, -2.2 + i * 0.75, -1.6 + i * 0.75); // janelas altas (direita)
  box(wallR - 0.02, wallR + t + 0.02, 0.05, 2.35, 1.3, 2.3, M.wood);    // porta lateral (direita)
  windowOn(wallR + t / 2, 1.5, 2.4, -0.6, 0.6);          // janela do térreo (direita)

  // escada: do térreo (direita) até a laje (esquerda), junto ao fundo
  const steps = 15;
  for (let i = 0; i < steps; i++) {
    const x1 = stairX1 - (i * (stairX1 - stairX0)) / steps;
    const x0 = x1 - (stairX1 - stairX0) / steps;
    const y1 = ((i + 1) * slabY) / steps;
    box(x0, x1, y1 - 0.18, y1, BACK + 0.05, stairZ1 - 0.1, M.wood);
  }

  // marquise esquerda com pilares e ripado de madeira junto à parede
  for (const z of [BACK + 0.3, 0, D / 2 - 0.3]) box(slabL + 0.05, slabL + 0.25, 0, slabY - 0.2, z - 0.1, z + 0.1, M.frame);
  for (let z = -1.2; z <= 1.2; z += 0.2) box(-6.25, -6.17, 0.25, 2.75, z - 0.035, z + 0.035, M.wood);

  // pendentes de iluminação, como no desenho
  for (const [x, y] of [[-1.6, 6.2], [3.0, 5.6]]) {
    box(x - 0.01, x + 0.01, y, roofY(x < roofRtop[0] ? eaveL : roofRtop, x < roofRtop[0] ? ridge : eaveR, x), -0.01, 0.01, M.lamp, false);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 16, 1, true), M.lamp);
    shade.position.set(x, y - 0.05, 0);
    house.add(shade);
  }

  // árvores dos dois lados (sombreamento natural)
  const tree = (x, z, s) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 3.2 * s, 8), M.trunk);
    trunk.position.y = 1.6 * s - 0.36;
    trunk.castShadow = true;
    g.add(trunk);
    [[0, 4.2, 0, 1.9, M.leaf], [-1.1, 3.6, 0.5, 1.4, M.leaf2], [1.0, 3.7, -0.4, 1.5, M.leaf], [0.2, 5.0, 0.3, 1.3, M.leaf2]].forEach(([dx, dy, dz, r, mat]) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), mat);
      c.position.set(dx * s, dy * s - 0.36, dz * s);
      c.castShadow = true;
      g.add(c);
    });
    g.position.set(x, 0, z);
    house.add(g);
  };
  tree(-11, 1.5, 1.15);
  tree(10.5, -1.5, 0.95);

  // seta do norte no chão (o cálculo do sol considera o fundo da casa voltado para o norte)
  const arrow = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 1.2), new THREE.Vector2(0.5, -0.4), new THREE.Vector2(0, -0.1), new THREE.Vector2(-0.5, -0.4)])),
    new THREE.MeshBasicMaterial({ color: "#a8352a" })
  );
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(-8.6, -0.33, -6.2);
  house.add(arrow);

  return house;
}

/* ---------- Pontos de interesse (lista ao lado do modelo) ---------- */
// posição 3D do marcador e da câmera ao selecionar cada item
const SPOTS = {
  paineis:   { at: [3.0, 6.6, 0], cam: [14, 13, 10] },
  lanternim: { at: [0.55, 7.6, 2], cam: [6, 9, 15] },
  chuva:     { at: [-6.1, 5.6, 2], cam: [-15, 8, 12] },
  arvores:   { at: [-11, 4.5, 1.5], cam: [-20, 7, 14] },
  beirais:   { at: [7.0, 3.1, 2], cam: [17, 5, 12] },
  ventilacao:{ at: [-5.4, 4.4, -0.6], cam: [2, 5, 16] },
};

/* ---------- Sol (Belo Horizonte, lat. −19,9°) ---------- */
const LAT = -19.92 * DEG;
const DECL = { verao: -23.44, equinocio: 0, inverno: 23.44 }; // declinação no solstício/equinócio
function sunVector(hour, season) {
  const d = DECL[season] * DEG, h = (hour - 12) * 15 * DEG;
  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(LAT) - Math.cos(d) * Math.cos(h) * Math.sin(LAT);
  const up = Math.sin(d) * Math.sin(LAT) + Math.cos(d) * Math.cos(h) * Math.cos(LAT);
  return new THREE.Vector3(east, up, -north); // x = leste, y = cima, z = sul (norte = −z)
}

/* ---------- Inicialização ---------- */
export function init({ container, markers, list, hourInput, hourOut, seasonBtns, viewBtns, rotateBtn, onReady }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dfe9ee");
  scene.fog = new THREE.Fog("#dfe9ee", 45, 80);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 45;
  controls.maxPolarAngle = 88 * DEG;
  controls.target.set(0, 3.5, 0);

  const sky = new THREE.HemisphereLight("#f2f6ff", "#6f8a5a", 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight("#fff4dc", 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 2, 0);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffe9a8", fog: false }));
  scene.add(sunDisc);

  scene.add(buildHouse(makeMaterials()));

  /* sol conforme estação e hora */
  let season = "inverno";
  function updateSun() {
    const hour = Number(hourInput.value);
    const v = sunVector(hour, season);
    const day = v.y > 0.02;
    sun.position.copy(v).multiplyScalar(40).add(sun.target.position);
    sun.intensity = day ? 0.6 + 2.2 * Math.min(v.y * 2, 1) : 0;
    sky.intensity = day ? 0.9 : 0.35;
    sunDisc.visible = day;
    sunDisc.position.copy(v).multiplyScalar(60);
    const hh = Math.floor(hour), mm = Math.round((hour - hh) * 60);
    const txt = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    hourOut.textContent = txt;
    hourInput.setAttribute("aria-valuetext", txt);
    requestRender();
  }
  hourInput.addEventListener("input", updateSun);
  seasonBtns.forEach((b) => b.addEventListener("click", () => {
    season = b.dataset.season;
    seasonBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    updateSun();
  }));

  /* câmera: vistas prontas, giro automático e foco nos itens da lista */
  let fly = null; // animação curta entre duas posições de câmera
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function goTo(pos, target) {
    const p = new THREE.Vector3(...pos), tg = new THREE.Vector3(...target);
    if (reduced) { camera.position.copy(p); controls.target.copy(tg); requestRender(); return; }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p, tg, start: performance.now() };
    requestRender();
  }
  const VIEWS = { corte: [[0, 4.2, 24], [0, 3.8, 0]], perspectiva: [[17, 11, 19], [0, 3.5, 0]], cima: [[0.1, 30, 4], [0, 0, 0]] };
  viewBtns.forEach((b) => b.addEventListener("click", () => goTo(...VIEWS[b.dataset.view])));
  rotateBtn.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    rotateBtn.setAttribute("aria-pressed", String(controls.autoRotate));
    requestRender();
  });

  // marcadores numerados sobre o modelo, ligados aos itens da lista
  const spotEls = {};
  [...list.querySelectorAll("[data-spot]")].forEach((btn, i) => {
    const key = btn.dataset.spot;
    const el = document.createElement("span");
    el.className = "h3d-marker";
    el.textContent = String(i + 1);
    markers.appendChild(el);
    spotEls[key] = el;
    btn.addEventListener("click", () => {
      list.querySelectorAll("[data-spot]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      Object.entries(spotEls).forEach(([k, m]) => m.classList.toggle("on", k === key));
      goTo(SPOTS[key].cam, SPOTS[key].at);
    });
  });
  const tmp = new THREE.Vector3();
  function placeMarkers() {
    const w = container.clientWidth, h = container.clientHeight;
    for (const [key, el] of Object.entries(spotEls)) {
      tmp.set(...SPOTS[key].at).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      el.style.display = visible ? "" : "none";
      if (visible) el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    }
  }

  /* renderização sob demanda: só desenha enquanto algo muda e a seção está na tela */
  let needs = true, onScreen = true;
  function requestRender() { needs = true; }
  controls.addEventListener("change", requestRender);
  function frame(now) {
    if (fly) {
      const k = Math.min((now - fly.start) / 900, 1), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(fly.p0, fly.p, e);
      controls.target.lerpVectors(fly.t0, fly.tg, e);
      if (k === 1) fly = null;
      needs = true;
    }
    const moving = controls.update(); // amortecimento e giro automático
    if (needs || moving || controls.autoRotate) {
      renderer.render(scene, camera);
      placeMarkers();
      needs = false;
    }
  }
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    renderer.setAnimationLoop(onScreen ? frame : null);
  });
  io.observe(container);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(container);

  camera.position.set(...VIEWS.perspectiva[0]);
  resize();
  updateSun();
  if (onReady) onReady();
}
