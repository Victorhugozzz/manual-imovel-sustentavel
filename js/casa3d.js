/* =========================================================
   casa3d.js — modelo 3D da casa a partir do corte esquemático
   Módulo carregado por main.js só quando a seção #casa-3d se aproxima.
   Depende de: vendor/three (Three.js r170, MIT)

   Medidas tiradas do corte (img/corte-casa.webp) na escala
   1 px ≈ 3 cm; o modelo é o corte "extrudado" em profundidade,
   aberto na frente como uma maquete em corte.
   A janelona, a fileira de janelas e o piso drenante vieram depois do corte.
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
// piso drenante visto de cima: blocos de concreto separados por juntas abertas (1 repetição = 1 m)
function pavers() {
  const S = 256, n = 2, cell = S / n, gap = 16;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#54534c";
  g.fillRect(0, 0, S, S);
  const tones = ["#c9c4b6", "#bdb8a9", "#c4bfb0", "#b5b0a2"];
  for (let i = 0; i < n * n; i++) {
    g.fillStyle = tones[i];
    g.fillRect((i % n) * cell + gap / 2, Math.floor(i / n) * cell + gap / 2, cell - gap, cell - gap);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; // mantém as juntas nítidas quando o chão é visto de lado
  return t;
}
// pedras soltas da faixa de drenagem junto à casa
function pebbles() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#77776f";
  g.fillRect(0, 0, S, S);
  const tones = ["#a3a39a", "#8a8a82", "#5f5f58", "#b6b6ac"];
  for (let i = 0; i < 420; i++) {
    g.fillStyle = tones[i % 4];
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 1.5 + Math.random() * 3, 0, Math.PI * 2);
    g.fill();
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
  const paverTex = pavers();
  paverTex.repeat.set(18, 12); // o piso tem 18 m × 12 m
  const pebbleTex = pebbles();
  pebbleTex.repeat.set(12, 10);
  return {
    paver: new THREE.MeshStandardMaterial({ map: paverTex, color: "#ffffff", roughness: 0.95 }),
    pebble: new THREE.MeshStandardMaterial({ map: pebbleTex, color: "#ffffff", roughness: 1 }),
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
    tank: new THREE.MeshStandardMaterial({ color: "#7f9aa3", roughness: 0.6 }),
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

  // terreno: piso drenante em volta da casa (só o topo tem blocos; as laterais mostram a brita da base)
  const groundY = -0.15;
  box(-9, 9, -0.35, groundY, -D / 2 - 1.5, D / 2 + 1.5, [M.gravel, M.gravel, M.paver, M.gravel, M.gravel, M.gravel]);

  // faixa de brita de 60 cm rente à casa: recebe a água que escorre e leva para o solo
  // (é um retângulo só; o miolo fica escondido sob o piso térreo)
  box(-6.13, 6.13, groundY, groundY + 0.015, BACK - 0.8, D / 2 + 0.6, [M.gravel, M.gravel, M.pebble, M.gravel, M.gravel, M.gravel], false);

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

  // altura de cada lateral até encontrar o telhado (as paredes são montadas mais abaixo, com as aberturas)
  const hL = roofY(eaveL, ridge, wallL), hR = roofY(roofRtop, eaveR, wallR);

  // parede do fundo seguindo o perfil do corte: fechada de cima a baixo
  const shape = new THREE.Shape();
  shape.moveTo(wallL, 0);
  shape.lineTo(wallL, hL);
  shape.lineTo(ridge[0] - 0.9, roofY(eaveL, ridge, ridge[0] - 0.9));
  shape.lineTo(roofRtop[0] + 0.15, roofY(eaveL, ridge, roofRtop[0] + 0.15));
  shape.lineTo(roofRtop[0] + 0.15, roofRtop[1]);
  shape.lineTo(wallR, hR);
  shape.lineTo(wallR, 0);
  shape.lineTo(wallL, 0);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), M.wallIn);
  back.position.z = BACK - t;
  add(back);
  box(wallL - t, wallR + t, groundY, 0, BACK - t, BACK, M.wallIn); // base da parede até o chão
  box(wallL - t, wallL, groundY, hL, BACK - t, BACK, M.wall);      // cantos com as laterais
  box(wallR, wallR + t, groundY, hR, BACK - t, BACK, M.wall);

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

  // janela: caixilho em grade (colunas × linhas) mais o vidro, pendurados em torno do topo.
  // `out` é o lado de fora (−1 esquerda, +1 direita); com `ang` > 0 a folha abre como maxim-ar.
  const bar = 0.05, tilt = 20 * DEG;
  const sash = (x, out, y0, y1, z0, z1, cols, rows, ang = tilt) => {
    const w = z1 - z0, h = y1 - y0;
    const grid = new THREE.Shape();
    grid.moveTo(-w / 2, -h); grid.lineTo(w / 2, -h); grid.lineTo(w / 2, 0); grid.lineTo(-w / 2, 0); grid.lineTo(-w / 2, -h);
    const cw = (w - bar) / cols, ch = (h - bar) / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const a = -w / 2 + bar + c * cw, b = a + cw - bar, d = -h + bar + r * ch, e = d + ch - bar;
        const hole = new THREE.Path();
        hole.moveTo(a, d); hole.lineTo(a, e); hole.lineTo(b, e); hole.lineTo(b, d); hole.lineTo(a, d);
        grid.holes.push(hole);
      }
    }
    const frame = new THREE.ExtrudeGeometry(grid, { depth: 0.05, bevelEnabled: false }).translate(0, 0, -0.025);
    const pane = new THREE.BoxGeometry(w - bar, h - bar, 0.012).translate(0, -h / 2, 0);
    const g = new THREE.Group();
    g.position.set(x, y1, (z0 + z1) / 2);
    g.rotation.set(0, Math.PI / 2, 0);
    g.rotateX(-out * ang);
    const f = new THREE.Mesh(frame, M.frame);
    f.castShadow = true;
    g.add(f, new THREE.Mesh(pane, M.glass));
    house.add(g);
  };
  // batentes de uma abertura, na espessura da parede
  const jambs = (x0, y0, y1, z0, z1) => {
    const f = 0.05;
    box(x0, x0 + t, y0, y0 + f, z0, z1, M.frame);
    box(x0, x0 + t, y1 - f, y1, z0, z1, M.frame);
    box(x0, x0 + t, y0 + f, y1 - f, z0, z0 + f, M.frame);
    box(x0, x0 + t, y0 + f, y1 - f, z1 - f, z1, M.frame);
  };
  // parede lateral maciça com os recortes [z0, z1, y0, y1]
  const sideWall = (x0, top, holes) => {
    const s = new THREE.Shape();
    s.moveTo(BACK, groundY); s.lineTo(D / 2, groundY); s.lineTo(D / 2, top); s.lineTo(BACK, top); s.lineTo(BACK, groundY);
    for (const [z0, z1, y0, y1] of holes) {
      const h = new THREE.Path();
      h.moveTo(z0, y0); h.lineTo(z0, y1); h.lineTo(z1, y1); h.lineTo(z1, y0); h.lineTo(z0, y0);
      s.holes.push(h);
    }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }), M.wall);
    m.rotation.y = -Math.PI / 2;
    m.position.x = x0 + t;
    add(m);
  };

  // esquerda, em cima: a janelona, de um canto da parede ao outro.
  // Um vidro só na metade de baixo e, com a travessa do corte, a metade de cima abre para o ar quente sair.
  const big = { z0: BACK + 0.12, z1: D / 2 - 0.12, y0: 3.8, y1: 5.4, mid: 4.6, n: 4 };
  const leafW = (big.z1 - big.z0 - 0.1) / big.n;
  // esquerda, embaixo: porta de vidro para a varanda, com o ripado à frente (como no corte)
  const glassDoor = { z0: 1.5, z1: 2.7, y1: 2.35 };
  sideWall(wallL - t, hL, [[big.z0, big.z1, big.y0, big.y1], [glassDoor.z0, glassDoor.z1, 0, glassDoor.y1]]);
  jambs(wallL - t, big.y0, big.y1, big.z0, big.z1);
  for (let i = 0; i < big.n; i++) {
    const z = big.z0 + 0.05 + i * leafW;
    sash(wallL - t / 2, -1, big.y0 + 0.05, big.mid, z, z + leafW, 1, 1, 0);
    sash(wallL - t / 2, -1, big.mid, big.y1 - 0.05, z, z + leafW, 1, 1);
  }
  jambs(wallL - t, 0, glassDoor.y1, glassDoor.z0, glassDoor.z1);
  sash(wallL - t / 2, -1, 0.05, glassDoor.y1 - 0.05, glassDoor.z0 + 0.05, glassDoor.z1 - 0.05, 2, 1, 0);

  // direita, embaixo: porta colada no fundo e a fileira de janelas de duas folhas até a frente
  const door = { z0: -4.1, z1: -3.1, y1: 2.35 };
  const row = { z0: -2.6, z1: 4.2, y0: 1.2, y1: 2.3, n: 5, gap: 0.25 };
  const rowW = (row.z1 - row.z0 - row.gap * (row.n - 1)) / row.n;
  const rowZ = Array.from({ length: row.n }, (_, i) => row.z0 + i * (rowW + row.gap));
  // direita, em cima: as três janelas altas do corte
  const high = { w: 1.5, y0: 3.85, y1: 4.55, at: [-3, 0, 3] };
  sideWall(wallR, hR, [
    [door.z0, door.z1, 0, door.y1],
    ...rowZ.map((z) => [z, z + rowW, row.y0, row.y1]),
    ...high.at.map((z) => [z - high.w / 2, z + high.w / 2, high.y0, high.y1]),
  ]);
  jambs(wallR, 0, door.y1, door.z0, door.z1);
  box(wallR + 0.06, wallR + t - 0.06, 0.05, door.y1 - 0.05, door.z0 + 0.05, door.z1 - 0.05, M.wood);
  for (const z of rowZ) {
    jambs(wallR, row.y0, row.y1, z, z + rowW);
    sash(wallR + t / 2, 1, row.y0 + 0.05, row.y1 - 0.05, z + 0.05, z + rowW - 0.05, 2, 1);
  }
  for (const z of high.at) {
    const z0 = z - high.w / 2, z1 = z + high.w / 2;
    jambs(wallR, high.y0, high.y1, z0, z1);
    sash(wallR + t / 2, 1, high.y0 + 0.05, high.y1 - 0.05, z0 + 0.05, z1 - 0.05, 2, 2);
  }

  // calhas nos beirais: a da esquerda desce para a cisterna, a da direita para a faixa de brita
  box(eaveL[0] - 0.2, eaveL[0] + 0.02, eaveL[1] - 0.12, eaveL[1] + 0.02, roofZ0, roofZ1, M.frame);
  box(eaveR[0] - 0.02, eaveR[0] + 0.2, eaveR[1] - 0.12, eaveR[1] + 0.02, roofZ0, roofZ1, M.frame);
  box(-6.36, -6.26, 1.2, eaveL[1] - 0.1, -5.0, -4.9, M.frame);
  box(6.1, 6.2, groundY, eaveR[1] - 0.1, -5.0, -4.9, M.frame);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 24), M.tank);
  tank.position.set(-6.7, groundY + 0.75, -5.25);
  tank.castShadow = tank.receiveShadow = true;
  house.add(tank);

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
  for (let z = -1.2; z <= 3.2; z += 0.2) box(-6.25, -6.17, 0.25, 2.75, z - 0.035, z + 0.035, M.wood);

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
  chuva:     { at: [-6.7, 1.7, -5.25], cam: [-16, 7, -12] },
  arvores:   { at: [-11, 4.5, 1.5], cam: [-20, 7, 14] },
  beirais:   { at: [7.0, 3.1, 2], cam: [17, 5, 12] },
  ventilacao:{ at: [-5.6, 4.6, 0], cam: [-14, 6.5, 14] },
  piso:      { at: [6.6, -0.1, 3.4], cam: [13.5, 6.5, 12.5] },
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

  const sky = new THREE.HemisphereLight("#f2f6ff", "#c2bbab", 0.9);
  scene.add(sky);
  const fill = new THREE.AmbientLight("#ffffff", 0.55); // clareia o interior, que fica sem sol direto
  scene.add(fill);
  const sun = new THREE.DirectionalLight("#fff4dc", 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
    fill.intensity = day ? 0.55 : 0.12;
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
