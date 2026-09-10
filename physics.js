/* Static world footprints; moving actors use swept, sliding circle collisions. */
(() => {
  'use strict';

  function create(width, height) {
    const CELL = 128,
      buckets = new Map();
    let obstacles = [];
    const active = o => !o.source || o.source.hp > 0;
    function set(items) {
      obstacles = items;
      buckets.clear();
      for (const o of items) for (let y = Math.floor((o.y - o.r) / CELL); y <= Math.floor((o.y + o.r) / CELL); y++) for (let x = Math.floor((o.x - o.r) / CELL); x <= Math.floor((o.x + o.r) / CELL); x++) {
        const key = x + ',' + y;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(o);
      }
    }
    function removeSource(source) {
      set(obstacles.filter(o => o.source !== source));
    }
    function obstacleAt(x, y, r, ignore = null) {
      if (x < r || y < r || x > width - r || y > height - r) return {
        x,
        y,
        r: 1,
        border: true
      };
      for (let by = Math.floor((y - r) / CELL); by <= Math.floor((y + r) / CELL); by++) for (let bx = Math.floor((x - r) / CELL); bx <= Math.floor((x + r) / CELL); bx++) {
        const list = buckets.get(bx + ',' + by);
        if (!list) continue;
        for (const o of list) if ((!ignore || o.source !== ignore) && active(o) && (x - o.x) ** 2 + (y - o.y) ** 2 < (r + o.r) ** 2 - .001) return o;
      }
      return null;
    }
    function clearLine(x, y, tx, ty, r, ignore = null) {
      if (tx < r || ty < r || tx > width - r || ty > height - r) return false;
      const dx = tx - x,
        dy = ty - y,
        length2 = dx * dx + dy * dy;
      for (const o of obstacles) {
        if (!active(o) || ignore && o.source === ignore) continue;
        const t = length2 ? Math.max(0, Math.min(1, ((o.x - x) * dx + (o.y - y) * dy) / length2)) : 0;
        if ((x + t * dx - o.x) ** 2 + (y + t * dy - o.y) ** 2 < (r + o.r) ** 2 - .001) return false;
      }
      return true;
    }
    function relocate(a) {
      if (!obstacleAt(a.x, a.y, a.r)) return true;
      for (let radius = 8; radius < Math.max(width, height); radius += 8) {
        const steps = Math.max(16, Math.ceil(radius / 4));
        for (let i = 0; i < steps; i++) {
          const x = a.x + Math.cos(i * Math.PI * 2 / steps) * radius,
            y = a.y + Math.sin(i * Math.PI * 2 / steps) * radius;
          if (!obstacleAt(x, y, a.r)) {
            a.x = x;
            a.y = y;
            return true;
          }
        }
      }
      return false;
    }
    function move(a, dx, dy, margin = a.r) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
      dx /= n;
      dy /= n;
      for (let i = 0; i < n; i++) {
        const x = Math.max(margin, Math.min(width - margin, a.x + dx)),
          y = Math.max(margin, Math.min(height - margin, a.y + dy));
        const hit = obstacleAt(x, y, a.r);
        if (!hit) {
          a.x = x;
          a.y = y;
          continue;
        }
        if (!hit.border) {
          const length = Math.hypot(a.x - hit.x, a.y - hit.y) || 1,
            nx = (a.x - hit.x) / length,
            ny = (a.y - hit.y) / length;
          const inward = Math.min(0, dx * nx + dy * ny),
            sx = Math.max(margin, Math.min(width - margin, a.x + dx - inward * nx)),
            sy = Math.max(margin, Math.min(height - margin, a.y + dy - inward * ny));
          if (!obstacleAt(sx, sy, a.r)) {
            a.x = sx;
            a.y = sy;
            continue;
          }
        }
        if (!obstacleAt(x, a.y, a.r)) a.x = x;
        if (!obstacleAt(a.x, y, a.r)) a.y = y;
      }
    }
    // Goal-directed grid search is requested only when the direct route is obstructed.
    function route(a, target) {
      const step = 48,
        cols = Math.ceil(width / step),
        rows = Math.ceil(height / step),
        total = cols * rows;
      const parents = new Int32Array(total);
      parents.fill(-2);
      const queue = new Int32Array(total),
        cost = new Uint16Array(total),
        start = Math.floor(a.y / step) * cols + Math.floor(a.x / step);
      const goalX = Math.floor(target.x / step),
        goalY = Math.floor(target.y / step);
      queue[0] = start;
      parents[start] = -1;
      let head = 0,
        tail = 1,
        end = -1;
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      while (head < tail) {
        let best = head,
          score = Infinity;
        for (let i = head; i < tail; i++) {
          const id = queue[i],
            value = cost[id] + Math.max(Math.abs(id % cols - goalX), Math.abs(Math.floor(id / cols) - goalY));
          if (value < score) {
            score = value;
            best = i;
          }
        }
        const selected = queue[best];
        queue[best] = queue[head];
        queue[head] = selected;
        const cell = queue[head++],
          cx = cell % cols,
          cy = Math.floor(cell / cols),
          x = cell === start ? a.x : (cx + .5) * step,
          y = cell === start ? a.y : (cy + .5) * step;
        if (Math.hypot(x - target.x, y - target.y) < step * 1.5 && (obstacleAt(target.x, target.y, a.r) || clearLine(x, y, target.x, target.y, a.r))) {
          end = cell;
          break;
        }
        for (const [ox, oy] of directions) {
          const nx = cx + ox,
            ny = cy + oy,
            id = ny * cols + nx;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || parents[id] !== -2) continue;
          const tx = (nx + .5) * step,
            ty = (ny + .5) * step;
          if (!clearLine(x, y, tx, ty, a.r)) continue;
          parents[id] = cell;
          cost[id] = cost[cell] + 1;
          queue[tail++] = id;
        }
      }
      if (end < 0) return [];
      const path = [{
        x: target.x,
        y: target.y
      }];
      while (end !== start) {
        path.push({
          x: (end % cols + .5) * step,
          y: (Math.floor(end / cols) + .5) * step
        });
        end = parents[end];
      }
      return path.reverse();
    }
    const routes = new WeakMap();
    let nextRouteAt = 0;
    function chase(a, target, distance, now) {
      let tx = target.x,
        ty = target.y;
      if (!clearLine(a.x, a.y, tx, ty, a.r)) {
        let cached = routes.get(a);
        if ((!cached || now > cached.until) && now >= nextRouteAt) {
          cached = {
            path: route(a, target),
            until: now + 1.2
          };
          routes.set(a, cached);
          nextRouteAt = now + .08;
        }
        const path = cached?.path;
        if (path?.length) {
          while (path.length && Math.hypot(path[0].x - a.x, path[0].y - a.y) < 8) path.shift();
          if (path.length) {
            tx = path[0].x;
            ty = path[0].y;
          }
        }
      } else routes.delete(a);
      const length = Math.hypot(tx - a.x, ty - a.y);
      if (length > 0) move(a, (tx - a.x) / length * Math.min(distance, length), (ty - a.y) / length * Math.min(distance, length));
    }
    return {
      set,
      removeSource,
      move,
      relocate,
      chase,
      clearLine,
      obstacleAt,
      get obstacles() {
        return obstacles;
      }
    };
  }
  window.AetherPhysics = {
    create
  };
})();
