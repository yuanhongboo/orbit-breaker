import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const FACINGS = 24;
const TYPES = ['player', 'scout', 'hunter', 'tank', 'gunner', 'boss', 'asteroid'];

function metal(color, roughness = 0.36, metalness = 0.55) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
  });
}
function light(color, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.24,
    metalness: 0.15,
  });
}
function add(root, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}
function plate(root, points, thickness, material, z = 0, bevel = 0.07) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 6,
  });
  return add(root, geometry, material, 0, 0, z);
}
function panel(root, x, y, w, h, z, material, thickness = 0.06) {
  return plate(
    root,
    [
      [x - w / 2, y - h / 2],
      [x + w / 2, y - h / 2],
      [x + w / 2, y + h / 2],
      [x - w / 2, y + h / 2],
    ],
    thickness,
    material,
    z,
    0.025,
  );
}
function cylinder(root, x, y, z, radius, length, material, axis = 'x', segments = 16) {
  const mesh = add(
    root,
    new THREE.CylinderGeometry(radius, radius, length, segments),
    material,
    x,
    y,
    z,
  );
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}
function ring(root, x, y, z, radius, tube, material, axis = 'z') {
  const mesh = add(root, new THREE.TorusGeometry(radius, tube, 8, 40), material, x, y, z);
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  return mesh;
}
function engine(root, x, y, z, size, shell, dark, glow) {
  cylinder(root, x, y, z, size * 0.38, size * 1.7, shell);
  cylinder(root, x - size * 0.84, y, z, size * 0.3, size * 0.13, dark);
  cylinder(root, x - size * 0.91, y, z, size * 0.22, size * 0.06, glow);
  ring(root, x - size * 0.9, y, z, size * 0.32, size * 0.045, shell, 'x');
  // Thermal fins and a raised service cover make each nacelle legible at close range.
  for (let i = 0; i < 4; i++)
    ring(root, x - size * (0.42 - i * 0.22), y, z, size * 0.39, size * 0.027, dark, 'x');
  panel(root, x + size * 0.05, y, size * 0.85, size * 0.35, z + size * 0.38, shell);
}
function gun(root, x, y, z, size, shell, dark, glow) {
  cylinder(root, x, y, z, size * 0.15, size * 1.8, dark);
  cylinder(root, x - size * 0.28, y, z, size * 0.24, size * 0.7, shell);
  cylinder(root, x + size * 0.91, y, z, size * 0.115, size * 0.04, glow);
}
function vents(root, x, y, count, material, z = 0.7) {
  for (let i = 0; i < count; i++) panel(root, x + i * 0.16, y, 0.06, 0.35, z, material, 0.015);
}

export function createShip(kind) {
  const root = new THREE.Group();
  root.name = `orbit-breaker-${kind}`;
  const dark = metal('#1c2b39', 0.48, 0.72);
  const edge = metal('#6e8997', 0.3, 0.82);
  if (kind === 'player') {
    const shell = metal('#e7e9dc', 0.32, 0.36);
    const accent = metal('#b9e75e', 0.34, 0.28);
    const glow = light('#98ecff', 3.6);
    const glass = metal('#174f61', 0.1, 0.7);
    plate(
      root,
      [
        [3.65, 0],
        [1.35, -0.54],
        [-1.65, -0.66],
        [-2.6, -0.4],
        [-2.9, 0],
        [-2.6, 0.4],
        [-1.65, 0.66],
        [1.35, 0.54],
      ],
      0.38,
      dark,
      -0.15,
    );
    plate(
      root,
      [
        [3.5, 0],
        [1.22, -0.43],
        [-1.75, -0.51],
        [-2.32, 0],
        [-1.75, 0.51],
        [1.22, 0.43],
      ],
      0.24,
      shell,
      0.23,
    );
    for (const side of [-1, 1]) {
      plate(
        root,
        [
          [1.4, side * 0.35],
          [-1.7, side * 3.15],
          [-2.62, side * 3.05],
          [-1.45, side * 1.0],
          [-2.0, side * 0.45],
        ],
        0.18,
        dark,
        -0.03,
      );
      plate(
        root,
        [
          [0.97, side * 0.6],
          [-1.64, side * 2.93],
          [-2.3, side * 2.91],
          [-1.15, side * 1.04],
        ],
        0.16,
        shell,
        0.2,
      );
      plate(
        root,
        [
          [-0.86, side * 1.63],
          [-1.85, side * 2.48],
          [-2.04, side * 2.46],
          [-1.05, side * 1.6],
        ],
        0.035,
        accent,
        0.41,
        0.015,
      );
      engine(root, -1.46, side * 1.15, 0.17, 1.18, shell, dark, glow);
      gun(root, 0.5, side * 1.34, 0.27, 0.7, edge, dark, glow);
      panel(root, -0.85, side * 0.35, 0.7, 0.11, 0.6, accent);
      vents(root, -1.6, side * 2.3, 4, dark, 0.47);
      const fin = plate(
        root,
        [
          [-2.23, side * 0.4],
          [-1.85, side * 0.62],
          [-1.01, side * 0.53],
          [-1.4, side * 0.4],
        ],
        0.18,
        shell,
        0.55,
      );
      fin.rotation.x = side * 0.1;
      add(
        root,
        new THREE.SphereGeometry(0.065, 8, 6),
        light(side < 0 ? '#ff6861' : '#a9ffc5'),
        -1.9,
        side * 2.94,
        0.47,
      );
    }
    const canopy = add(root, new THREE.SphereGeometry(0.65, 18, 10), glass, 0.6, 0, 0.53);
    canopy.scale.set(1.8, 0.64, 0.66);
    panel(root, -0.57, 0, 0.12, 0.59, 0.64, edge);
    panel(root, 1.9, 0, 0.8, 0.07, 0.52, accent, 0.025);
    vents(root, -1.75, 0, 6, dark, 0.6);
    panel(root, -2.38, 0, 0.25, 0.22, 0.48, glow);
  } else if (kind === 'scout') {
    const shell = metal('#bb5646', 0.38, 0.52),
      armor = metal('#e0baa2', 0.42, 0.32),
      glow = light('#ff9b5d');
    plate(
      root,
      [
        [3.1, 0],
        [0.45, -0.65],
        [-2.1, -0.57],
        [-2.45, 0],
        [-2.1, 0.57],
        [0.45, 0.65],
      ],
      0.43,
      dark,
    );
    plate(
      root,
      [
        [2.9, 0],
        [0.1, -0.44],
        [-1.65, -0.38],
        [-1.9, 0.38],
        [0.1, 0.44],
      ],
      0.22,
      shell,
      0.43,
    );
    for (const side of [-1, 1]) {
      plate(
        root,
        [
          [1.6, side * 0.48],
          [-1.85, side * 2.05],
          [-2.6, side * 1.9],
          [-1.55, side * 0.6],
        ],
        0.28,
        shell,
        0.1,
      );
      plate(
        root,
        [
          [0.48, side * 0.98],
          [-1.55, side * 1.79],
          [-2.02, side * 1.73],
          [-0.28, side * 0.92],
        ],
        0.07,
        armor,
        0.43,
      );
      engine(root, -1.66, side * 0.83, 0.22, 0.86, edge, dark, glow);
      gun(root, 0.92, side * 0.77, 0.3, 0.58, edge, dark, glow);
    }
    panel(root, 0.35, 0, 0.8, 0.26, 0.77, glow);
    vents(root, -1.4, 0, 5, dark, 0.75);
  } else if (kind === 'hunter') {
    const shell = metal('#8675b9', 0.29, 0.65),
      armor = metal('#c1b9dc', 0.4, 0.4),
      glow = light('#cf98ff', 3.3);
    plate(
      root,
      [
        [3.8, 0],
        [0.2, -0.48],
        [-2.3, -0.38],
        [-2.95, 0],
        [-2.3, 0.38],
        [0.2, 0.48],
      ],
      0.28,
      dark,
      0.12,
    );
    plate(
      root,
      [
        [3.63, 0],
        [0.36, -0.24],
        [-1.75, 0],
        [0.36, 0.24],
      ],
      0.21,
      armor,
      0.42,
    );
    for (const side of [-1, 1]) {
      plate(
        root,
        [
          [2.9, side * 1.76],
          [-0.05, side * 1.44],
          [-2.6, side * 0.26],
          [-1.8, side * 1.42],
          [0.2, side * 2.02],
        ],
        0.2,
        shell,
        0.05,
      );
      plate(
        root,
        [
          [2.4, side * 1.76],
          [0.1, side * 1.63],
          [-1.45, side * 0.8],
          [-0.75, side * 1.5],
          [0.25, side * 1.83],
        ],
        0.035,
        armor,
        0.34,
        0.015,
      );
      engine(root, -1.97, side * 0.56, 0.23, 0.77, shell, dark, glow);
      panel(root, 0.2, side * 1.82, 0.65, 0.075, 0.43, glow);
      gun(root, 2.1, side * 1.74, 0.25, 0.38, edge, dark, glow);
    }
    panel(root, 0.1, 0, 0.9, 0.18, 0.68, glow);
  } else if (kind === 'tank') {
    const shell = metal('#b07b42', 0.5, 0.63),
      armor = metal('#ddbb81', 0.4, 0.45),
      glow = light('#ffc26a');
    plate(
      root,
      [
        [2.35, -0.95],
        [1.35, -1.45],
        [-2.05, -1.38],
        [-2.75, -0.85],
        [-2.75, 0.85],
        [-2.05, 1.38],
        [1.35, 1.45],
        [2.35, 0.95],
      ],
      0.66,
      dark,
    );
    plate(
      root,
      [
        [2.02, -0.81],
        [1.23, -1.2],
        [-1.85, -1.2],
        [-2.25, -0.7],
        [-2.25, 0.7],
        [-1.85, 1.2],
        [1.23, 1.2],
        [2.02, 0.81],
      ],
      0.37,
      shell,
      0.67,
    );
    for (const side of [-1, 1]) {
      engine(root, -1.63, side * 1.63, 0.32, 1.42, shell, dark, glow);
      for (let i = 0; i < 3; i++)
        panel(root, -1.1 + i * 0.87, side * 1.11, 0.66, 0.46, 1.11, armor, 0.12);
      gun(root, 1.67, side * 0.77, 0.72, 0.9, shell, dark, glow);
      panel(root, -0.9, side * 1.77, 0.9, 0.24, 1.06, dark);
    }
    cylinder(root, -0.24, 0, 1.08, 0.78, 0.3, edge, 'z', 8);
    cylinder(root, -0.24, 0, 1.3, 0.49, 0.12, shell, 'z', 8);
    panel(root, 1.37, 0, 0.47, 0.57, 1.08, glow);
    vents(root, -1.85, 0, 6, dark, 1.16);
  } else if (kind === 'gunner') {
    const shell = metal('#6c98bb', 0.37, 0.65),
      armor = metal('#c2d4d7', 0.38, 0.4),
      glow = light('#8ad9ff');
    cylinder(root, 0, 0, 0.22, 1.24, 0.5, dark, 'z', 8);
    cylinder(root, 0, 0, 0.63, 1.1, 0.38, shell, 'z', 8);
    ring(root, 0, 0, 0.85, 0.74, 0.12, edge);
    cylinder(root, 0, 0, 0.85, 0.44, 0.15, glow, 'z', 16);
    for (const side of [-1, 1]) {
      panel(root, -0.4, side * 1.28, 1.85, 0.54, 0.31, dark, 0.2);
      panel(root, -0.35, side * 1.57, 1.8, 0.41, 0.49, armor, 0.14);
      engine(root, -1.3, side * 1.02, 0.25, 0.88, shell, dark, glow);
      gun(root, 1.25, side * 1.45, 0.48, 1.1, shell, dark, glow);
      panel(root, -0.4, side * 1.59, 0.7, 0.12, 0.7, shell);
    }
    gun(root, 1.24, 0, 0.46, 0.9, armor, dark, glow);
  } else if (kind === 'boss') {
    const shell = metal('#4b5865', 0.4, 0.75),
      armor = metal('#978f87', 0.48, 0.5),
      red = metal('#b64938', 0.43, 0.5),
      glow = light('#ff7150', 3.7);
    plate(
      root,
      [
        [4.3, 0],
        [2.1, -1.02],
        [-2.6, -0.94],
        [-3.7, -0.45],
        [-3.7, 0.45],
        [-2.6, 0.94],
        [2.1, 1.02],
      ],
      0.71,
      dark,
      -0.15,
    );
    plate(
      root,
      [
        [3.95, 0],
        [1.8, -0.7],
        [-2.7, -0.6],
        [-3.1, 0],
        [-2.7, 0.6],
        [1.8, 0.7],
      ],
      0.46,
      armor,
      0.56,
    );
    for (const side of [-1, 1]) {
      plate(
        root,
        [
          [2.66, side * 0.62],
          [0.8, side * 2.16],
          [-2.77, side * 2.77],
          [-3.65, side * 2.2],
          [-2.62, side * 1.39],
          [-0.81, side * 0.55],
        ],
        0.5,
        dark,
        -0.1,
      );
      plate(
        root,
        [
          [2.11, side * 0.81],
          [0.56, side * 1.96],
          [-2.6, side * 2.4],
          [-3.1, side * 2.04],
          [-2.37, side * 1.68],
          [-0.73, side * 0.74],
        ],
        0.31,
        shell,
        0.44,
      );
      for (let i = 0; i < 3; i++) {
        panel(root, -2.2 + i * 0.81, side * 1.92, 0.59, 0.49, 0.87, armor, 0.08);
        panel(root, -2.2 + i * 0.81, side * 1.92, 0.38, 0.08, 1.03, red);
        panel(root, -0.7 + i * 0.61, side * 0.61, 0.29, 0.12, 1.11, glow);
      }
      engine(root, -2.53, side * 1.31, 0.16, 1.33, shell, dark, glow);
      engine(root, -2.66, side * 0.54, 0.13, 0.8, edge, dark, glow);
      for (const x of [-0.87, 1.38]) {
        cylinder(root, x, side * 1.32, 0.98, 0.38, 0.21, dark, 'z', 12);
        gun(root, x + 0.3, side * 1.32, 1.14, 0.58, shell, dark, glow);
      }
      gun(root, 2.08, side * 0.42, 0.67, 0.8, red, dark, glow);
    }
    cylinder(root, -1, 0, 1.18, 0.6, 0.39, dark, 'z', 12);
    ring(root, -1, 0, 1.4, 0.52, 0.12, edge);
    cylinder(root, -1, 0, 1.4, 0.35, 0.14, glow, 'z');
    panel(root, 0.36, 0, 0.94, 0.44, 1.06, dark, 0.19);
    panel(root, 0.48, 0, 0.53, 0.32, 1.29, light('#ffb180'));
    panel(root, 2.67, 0, 0.66, 0.18, 1.12, red);
    vents(root, -2.67, 0, 6, dark, 1.09);
  } else {
    const geometry = new THREE.IcosahedronGeometry(2.5, 2);
    const points = geometry.attributes.position;
    const color = new THREE.Color();
    const colors = new Float32Array(points.count * 3);
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i),
        z = points.getZ(i);
      const rough =
        0.87 + Math.sin(x * 3.8 + y * 2.9 + z * 4.6) * 0.12 + Math.sin(x * 9.2 - z * 5.8) * 0.035;
      points.setXYZ(i, x * rough * 1.15, y * rough * 0.8, z * rough * 0.67);
      color.setHSL(0.57, 0.1, 0.2 + rough * 0.085);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    add(
      root,
      geometry,
      new THREE.MeshStandardMaterial({ color: '#566071', vertexColors: true, roughness: 0.96 }),
    );
  }
  return root;
}

/** Bakes real geometry once; gameplay draws cached views without running a live 3D scene. */
export class Shipyard {
  constructor() {
    this.sprites = new Map();
    this.ready = false;
    this.metrics = { facings: FACINGS, models: 0, meshes: 0, triangles: 0 };
  }

  async prepare() {
    const started = performance.now();
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const environment = document.createElement('canvas');
    environment.width = 512;
    environment.height = 256;
    const env = environment.getContext('2d');
    const gradient = env.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#b6ccdc');
    gradient.addColorStop(0.35, '#71879b');
    gradient.addColorStop(0.5, '#253e50');
    gradient.addColorStop(0.76, '#111a24');
    gradient.addColorStop(1, '#304054');
    env.fillStyle = gradient;
    env.fillRect(0, 0, 512, 256);
    env.fillStyle = '#eaf4f5';
    env.fillRect(55, 50, 70, 55);
    env.fillStyle = '#597ea7';
    env.fillRect(360, 60, 120, 65);
    const texture = new THREE.CanvasTexture(environment);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = texture;
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x101926, 2.2));
    for (const [color, power, position] of [
      [0xfff3d9, 4.2, [-4, 7, 12]],
      [0x74a9ff, 2.4, [4, -7, 5]],
      [0xafffff, 2.5, [-8, -2, 4]],
    ]) {
      const source = new THREE.DirectionalLight(color, power);
      source.position.set(...position);
      scene.add(source);
    }
    const camera = new THREE.OrthographicCamera(-5.3, 5.3, 5.3, -5.3, 0.1, 100);
    camera.up.set(0, 1, 0);
    camera.position.set(0, -5, 24);
    camera.lookAt(0, 0, 0);
    try {
      for (const kind of TYPES) {
        const model = createShip(kind);
        scene.add(model);
        this.metrics.models++;
        model.traverse((object) => {
          if (!object.isMesh) return;
          this.metrics.meshes++;
          this.metrics.triangles += object.geometry.index
            ? object.geometry.index.count / 3
            : object.geometry.attributes.position.count / 3;
        });
        const size = kind === 'boss' ? 256 : 128;
        renderer.setSize(size, size, false);
        const images = [];
        for (let i = 0; i < FACINGS; i++) {
          model.rotation.z = (-i / FACINGS) * TAU;
          renderer.render(scene, camera);
          const image = document.createElement('canvas');
          image.width = image.height = size;
          image.getContext('2d').drawImage(canvas, 0, 0);
          images.push(image);
          if (i % 8 === 7) await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        this.sprites.set(kind, images);
        model.rotation.z = -0.15;
        camera.position.set(-6, -10, 16);
        camera.lookAt(0, 0, 0);
        renderer.setSize(kind === 'player' ? 1024 : 512, kind === 'player' ? 1024 : 512, false);
        renderer.render(scene, camera);
        const portrait = document.createElement('canvas');
        portrait.width = portrait.height = canvas.width;
        portrait.getContext('2d').drawImage(canvas, 0, 0);
        this.sprites.set(`${kind}:portrait`, portrait);
        camera.position.set(0, -5, 24);
        camera.lookAt(0, 0, 0);
        scene.remove(model);
        const geometries = new Set(),
          materials = new Set();
        model.traverse((object) => {
          if (object.isMesh) {
            geometries.add(object.geometry);
            materials.add(object.material);
          }
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      this.ready = true;
      this.metrics.bakeMs = Math.round(performance.now() - started);
      this.metrics.rgbaMiB = +(
        TYPES.reduce((n, t) => n + FACINGS * (t === 'boss' ? 256 : 128) ** 2 * 4, 0) / 1024 / 1024 +
        10
      ).toFixed(1);
    } finally {
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
    return this;
  }

  draw(context, kind, x, y, angle, size, portrait = false) {
    if (!this.ready) return false;
    const index = ((Math.round((angle / TAU) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    const image = portrait ? this.sprites.get(`${kind}:portrait`) : this.sprites.get(kind)?.[index];
    if (!image) return false;
    context.drawImage(image, x - size / 2, y - size / 2, size, size);
    return true;
  }
}
