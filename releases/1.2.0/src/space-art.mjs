import { random } from './core.mjs';

function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let u = x - ix,
    v = y - iy;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy),
    c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function terrain(x, y) {
  return noise(x, y) * 0.57 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.15;
}

export class SpaceArt {
  constructor() {
    this.planet = this.makePlanet(512);
    this.sky = document.createElement('canvas');
    this.skySize = '';
    this.halo = document.createElement('canvas');
    this.halo.width = this.halo.height = 128;
    const c = this.halo.getContext('2d'),
      glow = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.09, '#ffecc9bb');
    glow.addColorStop(0.3, '#ffb77244');
    glow.addColorStop(1, '#ffb77200');
    c.fillStyle = glow;
    c.fillRect(0, 0, 128, 128);
  }
  makePlanet(size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d'),
      image = c.createImageData(size, size),
      data = image.data;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = (x - size / 2) / (size * 0.495),
          ny = (y - size / 2) / (size * 0.495),
          length = nx * nx + ny * ny;
        if (length > 1) continue;
        const nz = Math.sqrt(1 - length);
        const longitude = Math.atan2(nx, nz),
          latitude = Math.asin(ny);
        const a = longitude * 4.3 + 12.7,
          b = latitude * 4.3 + 8.3;
        const land = terrain(a + noise(a * 1.4, b * 1.4) * 1.7, b);
        const clouds = Math.max(0, terrain(a * 1.9 + 4, b * 2.1 - 3) - 0.57) * 2.4;
        const lit = Math.max(0, -nx * 0.63 - ny * 0.44 + nz * 0.64);
        const sun = 0.065 + lit * 1.1,
          shore = Math.min(1, Math.max(0, (land - 0.44) * 8));
        const detail = 0.76 + noise(a * 18, b * 18) * 0.24;
        const colors = [39 + shore * 132, 74 + shore * 85, 92 + shore * 36];
        const index = (y * size + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const surface = colors[channel] * detail;
          data[index + channel] = Math.min(
            255,
            (surface * (1 - clouds) + 230 * clouds) * sun +
              Math.pow(1 - nz, 4) * [5, 18, 26][channel] * Math.sqrt(lit),
          );
        }
        data[index + 3] = Math.min(255, (1 - length) * size * 150);
      }
    c.putImageData(image, 0, 0);
    return canvas;
  }

  drawSky(c, w, h) {
    const key = `${Math.round(w)}:${Math.round(h)}`;
    if (this.skySize !== key) {
      this.skySize = key;
      this.sky.width = Math.round(w);
      this.sky.height = Math.round(h);
      const sky = this.sky.getContext('2d'),
        rng = random(7913);
      sky.fillStyle = '#070e14';
      sky.fillRect(0, 0, w, h);
      const field = sky.createRadialGradient(w * 0.72, h * 0.38, 0, w * 0.7, h * 0.35, w * 0.83);
      field.addColorStop(0, '#223c42');
      field.addColorStop(0.45, '#13212c');
      field.addColorStop(1, '#070e14');
      sky.fillStyle = field;
      sky.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = w * (0.16 + rng() * 0.99),
          y = h * (0.06 + rng() * 0.9),
          r = (40 + rng() * 160) * Math.min(w / 800, 1.5);
        const glow = sky.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, i % 3 ? '#638c8d07' : '#b4976709');
        glow.addColorStop(1, '#00000000');
        sky.fillStyle = glow;
        sky.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 1200; i++) {
        sky.fillStyle = i % 9 ? '#d8e6dc08' : '#a8e8ff16';
        sky.fillRect(rng() * w, rng() * h, 1, 1);
      }
    }
    c.drawImage(this.sky, 0, 0, w, h);
  }

  drawPlanet(c, x, y, radius, opacity = 1, rings = true) {
    c.save();
    c.translate(x, y);
    c.globalAlpha = opacity;
    const halo = c.createRadialGradient(0, 0, radius * 0.93, 0, 0, radius * 1.1);
    halo.addColorStop(0, '#a8e8ff00');
    halo.addColorStop(0.48, '#7ecbda24');
    halo.addColorStop(0.62, '#79d7f22c');
    halo.addColorStop(1, '#5bcaf000');
    c.fillStyle = halo;
    c.fillRect(-radius * 1.1, -radius * 1.1, radius * 2.2, radius * 2.2);
    const ring = (start, end) => {
      c.save();
      c.rotate(-0.42);
      const rng = random(129);
      for (let i = 0; i < 32; i++) {
        const rx = radius * (1.35 + i * 0.017),
          ry = rx * 0.28;
        c.beginPath();
        c.ellipse(0, 0, rx, ry, 0, start, end);
        c.strokeStyle = `rgba(170,161,130,${0.03 + rng() * 0.09})`;
        c.lineWidth = 1 + radius * 0.003;
        c.stroke();
      }
      c.restore();
    };
    if (rings) ring(Math.PI, Math.PI * 2);
    c.drawImage(this.planet, -radius, -radius, radius * 2, radius * 2);
    if (rings) ring(0, Math.PI);
    c.restore();
  }

  glow(c, x, y, size, opacity = 1) {
    c.save();
    c.globalAlpha *= opacity;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(this.halo, x - size / 2, y - size / 2, size, size);
    c.restore();
  }
}
