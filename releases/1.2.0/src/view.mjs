import { VIEW } from './config.mjs';

export function getViewMetrics(width, height, safe = {}) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const mobile = width < VIEW.mobileBreakpoint;
  const scale = mobile
    ? width / VIEW.mobileWorldWidth
    : Math.min(width / VIEW.desktopWorldWidth, height / VIEW.desktopWorldHeight);
  const compact = height < VIEW.compactHeight;
  const top = Math.min(
    height * 0.35,
    (compact ? VIEW.compactTopInset : VIEW.topInset) + (safe.top || 0),
  );
  const bottom = Math.min(
    height * 0.28,
    (compact ? VIEW.compactBottomInset : VIEW.bottomInset) + (safe.bottom || 0),
  );
  return {
    width,
    height,
    scale,
    mobile,
    bounds: {
      left: (-width / 2 + VIEW.sideInset) / scale,
      right: (width / 2 - VIEW.sideInset) / scale,
      top: (-height / 2 + top) / scale,
      bottom: (height / 2 - bottom) / scale,
    },
  };
}

export function setViewport(game, width, height, safe) {
  game.view = getViewMetrics(width, height, safe);
  return game.view;
}

export function isTargetVisible(game, target) {
  if (!game.view) return true;
  const b = game.view.bounds,
    c = game.camera,
    padding = target.radius;
  const x = target.x - c.x,
    y = target.y - c.y;
  return (
    x >= b.left + padding &&
    x <= b.right - padding &&
    y >= b.top + padding &&
    y <= b.bottom - padding
  );
}

export function spawnPosition(game, radius) {
  const b = game.view.bounds,
    c = game.camera,
    margin = VIEW.spawnMargin / game.view.scale + radius;
  const left = b.left - margin,
    right = b.right + margin,
    top = b.top - margin,
    bottom = b.bottom + margin;
  const width = right - left,
    height = bottom - top;
  let along = game.rng() * (2 * width + 2 * height);
  if (along < width) return { x: c.x + left + along, y: c.y + top };
  along -= width;
  if (along < height) return { x: c.x + right, y: c.y + top + along };
  along -= height;
  if (along < width) return { x: c.x + right - along, y: c.y + bottom };
  return { x: c.x + left, y: c.y + bottom - (along - width) };
}
