import { TOUCH } from './config.mjs';

/** Pure pointer gesture state, independent of DOM and game simulation. */
export class FlightGesture {
  constructor(config = TOUCH) {
    this.config = config;
    this.end();
  }
  begin(x, y, time) {
    this.anchor = { x, y };
    this.origin = { x, y };
    this.maxTravel = 0;
    this.started = time;
    this.lastFlick = -Infinity;
    this.samples = [{ x, y, time }];
    this.active = true;
    return { x: 0, y: 0, anchor: { ...this.anchor }, flick: null };
  }
  move(x, y, time) {
    if (!this.active) return null;
    const dx = x - this.anchor.x,
      dy = y - this.anchor.y,
      length = Math.hypot(dx, dy);
    const magnitude = Math.max(
      0,
      Math.min(1, (length - this.config.deadzone) / (this.config.radius - this.config.deadzone)),
    );
    this.maxTravel = Math.max(this.maxTravel, Math.hypot(x - this.origin.x, y - this.origin.y));
    const vx = length ? dx / length : 0,
      vy = length ? dy / length : 0;
    if (length > this.config.radius)
      this.anchor = { x: x - vx * this.config.radius, y: y - vy * this.config.radius };
    this.samples.push({ x, y, time });
    this.samples = this.samples
      .filter((point) => time - point.time <= this.config.sampleWindowMs)
      .slice(-12);
    const first = this.samples[0],
      elapsed = time - first.time;
    const fx = x - first.x,
      fy = y - first.y,
      travel = Math.hypot(fx, fy);
    let flick = null;
    if (
      time - this.started >= this.config.minimumHoldMs &&
      time - this.lastFlick >= this.config.flickDebounceMs &&
      elapsed >= 16 &&
      travel >= this.config.flickDistance &&
      travel / elapsed >= this.config.flickSpeed
    ) {
      flick = { x: fx / travel, y: fy / travel };
      this.lastFlick = time;
      this.samples = [{ x, y, time }];
    }
    return { x: vx * magnitude, y: vy * magnitude, anchor: { ...this.anchor }, flick };
  }
  finish(x, y, time) {
    if (!this.active) return { doubleTap: false };
    const travel = Math.max(this.maxTravel, Math.hypot(x - this.origin.x, y - this.origin.y));
    const tapped =
      time - this.started <= this.config.tapDurationMs && travel <= this.config.tapSlop;
    const doubleTap = Boolean(
      tapped &&
      this.lastTap &&
      time - this.lastTap.time <= this.config.doubleTapWindowMs &&
      Math.hypot(x - this.lastTap.x, y - this.lastTap.y) <= this.config.doubleTapDistance,
    );
    this.lastTap = tapped && !doubleTap ? { x, y, time } : null;
    this.active = false;
    this.samples = [];
    return { doubleTap };
  }
  end() {
    this.active = false;
    this.samples = [];
    this.anchor = { x: 0, y: 0 };
    this.lastTap = null;
  }
}
