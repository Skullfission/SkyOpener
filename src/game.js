import * as THREE from 'three';
import { Input } from './input.js';
import { createShip, createEnemy, SHIP_HIT_RADIUS } from './ship.js';
import { audio } from './audio.js';

const FORWARD_SPEED = 60;
const BOOST_MULT = 1.6;
const BRAKE_MULT = 0.55;
const PLAY_HALF_W = 14;
const PLAY_TOP = 8;
const PLAY_BOTTOM = -4;
const STEER_ACCEL = 70;
const STEER_DAMP = 4.5;
const MAX_LATERAL = 22;
const ROLL_DURATION = 0.55;
const LOOP_DURATION = 0.9;
const FIRE_COOLDOWN = 0.16;
const SHIELD_MAX = 150;
const SHIELD_START = 100;
const HOMING_TURN = 7.0;          // radians/sec equivalent for laser steering
const LASER_FORWARD_SPEED = 220;
const MISSILE_FORWARD_SPEED = 110;
const MISSILE_TURN = 4.5;
const MISSILE_LIFE = 4.0;
const MAX_MISSILES = 9;
const MISSILES_PER_PICKUP = 3;
const PICKUP_INTERVAL_MIN = 8;
const PICKUP_INTERVAL_MAX = 14;
const ENEMY_HP = 3;

// Camera sits behind & slightly above the ship, level — putting the vanishing
// point at screen center so obstacles read clearly as you fly toward them.
const CAM_OFFSET = new THREE.Vector3(0, 1.2, -8);
const LOOK_AHEAD_Z = 60;

export class Game {
  constructor(canvas, hud, hooks = {}) {
    this.canvas = canvas;
    this.hud = hud;
    this.hooks = hooks; // { onPauseToggle, onDeath }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080f);
    this.scene.fog = new THREE.Fog(0x05080f, 90, 360);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 800);
    // Set the camera to its target position immediately so the very first frame
    // already frames the ship correctly (no slow zoom-in from origin).
    this.camera.position.set(0, 1.2, -8);
    this.camera.lookAt(0, 1.2, 60);

    this._buildStaticScene();

    this.ship = createShip();
    this.scene.add(this.ship);

    this._initState();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _initState() {
    this.shipVel = new THREE.Vector2(0, 0);
    this.rollTime = 0;
    this.rollDir = 0;
    this.loopTime = 0;
    this.loopDir = 0;
    this.fireCooldown = 0;
    this.shipBank = 0;
    this.distance = 0;
    this.score = 0;
    this.shield = SHIELD_START;
    this.missiles = 0;
    this.alive = true;
    this.speedMult = 1;
    this.paused = false;
    this.lasers = []; this.enemyShots = [];
    this.enemies = []; this.obstacles = []; this.particles = [];
    this.missileProjs = [];
    this.pickups = [];
    this.spawnTimer = 1.5;
    this.obstacleTimer = 1.5;
    this.pickupTimer = 5;
    if (this.ship) {
      this.ship.position.set(0, 0, 0);
      this.ship.rotation.set(0, 0, 0);
    }
  }

  _buildStaticScene() {
    this.scene.add(new THREE.AmbientLight(0x556677, 0.7));
    const sun = new THREE.DirectionalLight(0xffe9c4, 0.9);
    sun.position.set(40, 60, 30);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.5);
    rim.position.set(-30, 10, -20);
    this.scene.add(rim);

    // Starfield
    const sg = new THREE.BufferGeometry();
    const N = 1500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 600;
      pos[i*3+1] = (Math.random() - 0.5) * 200;
      pos[i*3+2] = (Math.random() - 0.5) * 1200;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaadfff, size: 0.6, sizeAttenuation: true }));
    this.scene.add(this.stars);

    // Ground grid (wireframe + solid). Ground is well below ship; horizon ~ screen center.
    const gridSolid = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x05111e, roughness: 1 }),
    );
    gridSolid.rotation.x = -Math.PI / 2;
    gridSolid.position.y = -10;
    this.scene.add(gridSolid);

    const gridWire = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 4000, 80, 160),
      new THREE.MeshBasicMaterial({ color: 0x0c2a4a, wireframe: true, transparent: true, opacity: 0.55 }),
    );
    gridWire.rotation.x = -Math.PI / 2;
    gridWire.position.y = -9.99;
    this.scene.add(gridWire);
    this.ground = gridWire;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // updateStyle=true so the canvas CSS box matches the framebuffer exactly.
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  reset() {
    for (const arr of [this.lasers, this.enemyShots, this.enemies, this.obstacles, this.particles, this.missileProjs, this.pickups]) {
      for (const o of arr) this.scene.remove(o);
    }
    if (!this.ship.parent) this.scene.add(this.ship);
    this._initState();
    this.hud.msg.textContent = '';
  }

  setPaused(p) {
    this.paused = !!p;
    Input.setEnabled(!p);
  }

  findNearestEnemy(originX, originY, fromZ = 0) {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.userData.alive) continue;
      if (e.position.z < fromZ + 1) continue;
      const dx = e.position.x - originX;
      const dy = e.position.y - originY;
      const dz = Math.max(1, e.position.z - fromZ);
      const d = dx*dx + dy*dy + dz*dz * 0.25;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  spawnLaser(x, y, z, vz, color, fromPlayer, target = null) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 1.8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.userData = { vz, vx: 0, vy: 0, fromPlayer, life: 2.5, target };
    this.scene.add(m);
    (fromPlayer ? this.lasers : this.enemyShots).push(m);
    return m;
  }

  spawnMissile(target) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0x442200, metalness: 0.4, roughness: 0.4 }),
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff6644, emissive: 0x331100 }),
    );
    fin.position.z = -0.25;
    group.add(fin);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffeebb }),
    );
    flame.position.z = -0.55;
    group.add(flame);
    const light = new THREE.PointLight(0xffaa44, 1.0, 5);
    group.add(light);
    group.position.copy(this.ship.position);
    group.position.z += 1;
    group.userData = {
      vel: new THREE.Vector3(0, 0, MISSILE_FORWARD_SPEED),
      target,
      life: MISSILE_LIFE,
      flame,
    };
    this.scene.add(group);
    this.missileProjs.push(group);
  }

  spawnPickup(type, position = null) {
    const pickup = this._buildPickupMesh(type);
    if (position) pickup.position.copy(position);
    else pickup.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.3) * 5, 240 + Math.random() * 60);
    this.scene.add(pickup);
    this.pickups.push(pickup);
    return pickup;
  }

  // Used when an enemy drops a pickup at its death location (no auto-add to list,
  // caller handles placement into the array).
  makeFloatingPickup(type, position) {
    const pickup = this._buildPickupMesh(type);
    pickup.position.copy(position);
    this.scene.add(pickup);
    return pickup;
  }

  _buildPickupMesh(type) {
    const colors = { health: 0xff4477, shield: 0x44aaff, missile: 0xffcc44 };
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: colors[type], emissive: colors[type], emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }),
    );
    group.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 6, 20),
      new THREE.MeshBasicMaterial({ color: colors[type], transparent: true, opacity: 0.7 }),
    );
    group.add(ring);
    if (type === 'health') {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      group.add(c1); group.add(c2);
    } else if (type === 'shield') {
      const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      group.add(sh);
    } else if (type === 'missile') {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      tip.rotation.x = Math.PI / 2;
      group.add(tip);
    }
    const glow = new THREE.PointLight(colors[type], 0.8, 4);
    group.add(glow);
    group.userData = { type, ring };
    return group;
  }

  applyPickup(type) {
    audio.beep({ freq: 880, slideTo: 1500, dur: 0.25, type: 'triangle', gain: 0.35 });
    if (type === 'health') {
      this.shield = Math.min(SHIELD_MAX, this.shield + 25);
      this.hud.msg.textContent = '+25 HEALTH';
    } else if (type === 'shield') {
      this.shield = Math.min(SHIELD_MAX, this.shield + 50);
      this.hud.msg.textContent = '+50 SHIELD';
    } else if (type === 'missile') {
      this.missiles = Math.min(MAX_MISSILES, this.missiles + MISSILES_PER_PICKUP);
      this.hud.msg.textContent = `+${MISSILES_PER_PICKUP} MISSILES`;
    }
    this._msgClearAt = performance.now() / 1000 + 1.5;
  }

  spawnEnemy() {
    const e = createEnemy();
    e.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.3) * 6, 240 + Math.random() * 80);
    e.userData = {
      hp: ENEMY_HP,
      shootCooldown: 1.2 + Math.random() * 1.4,
      driftPhase: Math.random() * Math.PI * 2,
      approachSpeed: 18 + Math.random() * 14,
      alive: true,
    };
    this.scene.add(e);
    this.enemies.push(e);
  }

  spawnObstacle() {
    const tall = 12 + Math.random() * 14;
    const r = 1 + Math.random() * 2;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.7, r, tall, 10),
      new THREE.MeshStandardMaterial({ color: 0x446677, roughness: 0.9, metalness: 0.1, flatShading: true }),
    );
    // base sits on ground (y=-10), so y center = -10 + tall/2
    m.position.set((Math.random() - 0.5) * 26, -10 + tall / 2, 280 + Math.random() * 120);
    m.userData = { radius: r, halfH: tall / 2 };
    this.scene.add(m);
    this.obstacles.push(m);
  }

  spawnExplosion(pos, color = 0xffaa44) {
    audio.explosion();
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.18 + Math.random() * 0.2),
        new THREE.MeshBasicMaterial({ color }),
      );
      p.position.copy(pos);
      const dir = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
        .normalize().multiplyScalar(8 + Math.random() * 8);
      p.userData = { vel: dir, life: 0.8 + Math.random() * 0.4 };
      this.scene.add(p);
      this.particles.push(p);
    }
  }

  update(dt) {
    Input.update(dt);

    // Pause toggle is global
    if (Input.pausePressed && this.hooks.onPauseToggle) {
      this.hooks.onPauseToggle();
    }
    // Reset is allowed any time
    if (Input.resetPressed) {
      this.reset();
      return;
    }

    if (this.paused) return;

    if (!this.alive) {
      this.updateParticles(dt);
      return;
    }

    // forward speed
    let mult = 1;
    if (Input.boost) mult = BOOST_MULT;
    else if (Input.brake) mult = BRAKE_MULT;
    this.speedMult = THREE.MathUtils.damp(this.speedMult, mult, 5, dt);
    const forward = FORWARD_SPEED * this.speedMult;
    this.distance += forward * dt;

    // ship lateral motion — camera looks toward +Z, so screen-left is world +X.
    // Invert steerX so A / Left moves the ship to screen-left.
    const ax = -Input.steerX * STEER_ACCEL;
    const ay = -Input.steerY * STEER_ACCEL;
    this.shipVel.x += ax * dt;
    this.shipVel.y += ay * dt;
    this.shipVel.multiplyScalar(Math.exp(-STEER_DAMP * dt));
    this.shipVel.x = THREE.MathUtils.clamp(this.shipVel.x, -MAX_LATERAL, MAX_LATERAL);
    this.shipVel.y = THREE.MathUtils.clamp(this.shipVel.y, -MAX_LATERAL, MAX_LATERAL);
    this.ship.position.x += this.shipVel.x * dt;
    this.ship.position.y += this.shipVel.y * dt;
    if (this.ship.position.x >  PLAY_HALF_W) { this.ship.position.x =  PLAY_HALF_W; this.shipVel.x = 0; }
    if (this.ship.position.x < -PLAY_HALF_W) { this.ship.position.x = -PLAY_HALF_W; this.shipVel.x = 0; }
    if (this.ship.position.y >  PLAY_TOP)    { this.ship.position.y =  PLAY_TOP;    this.shipVel.y = 0; }
    if (this.ship.position.y <  PLAY_BOTTOM) { this.ship.position.y =  PLAY_BOTTOM; this.shipVel.y = 0; }

    // bank + pitch — bank into the turn (lean toward screen-direction of travel)
    const targetBank = Input.steerX * 0.55;
    this.shipBank = THREE.MathUtils.damp(this.shipBank, targetBank, 6, dt);
    if (Input.rollRequest !== 0 && this.rollTime <= 0 && this.loopTime <= 0) {
      this.rollDir = Input.rollRequest;
      this.rollTime = ROLL_DURATION;
      audio.deflect();
    }
    if (Input.loopRequest !== 0 && this.loopTime <= 0 && this.rollTime <= 0) {
      this.loopDir = Input.loopRequest;
      this.loopTime = LOOP_DURATION;
      audio.deflect();
    }
    let rollAngle = 0;
    if (this.rollTime > 0) {
      const t = 1 - this.rollTime / ROLL_DURATION;
      rollAngle = this.rollDir * t * Math.PI * 2;
      this.rollTime -= dt;
    }
    let loopAngle = 0;
    if (this.loopTime > 0) {
      const t = 1 - this.loopTime / LOOP_DURATION;
      // forward loop (W/Up) tips nose down then over the top — pitch -2π,
      // backward loop (S/Down) tips nose up then over backward — pitch +2π.
      loopAngle = -this.loopDir * t * Math.PI * 2;
      this.loopTime -= dt;
    }
    const targetPitch = Input.steerY * 0.25;
    this.ship.rotation.set(targetPitch + loopAngle, 0, this.shipBank + rollAngle);

    // collider tint while invulnerable (roll OR loop)
    const collider = this.ship.userData.collider;
    if (collider) {
      const invuln = this.rollTime > 0 || this.loopTime > 0;
      collider.material.color.setHex(invuln ? 0x66ffaa : 0xffff66);
      collider.material.opacity = invuln ? 0.55 : 0.3;
    }

    // camera follow — keep horizon at screen center
    const camTargetX = this.ship.position.x * 0.4 + CAM_OFFSET.x;
    const camTargetY = this.ship.position.y * 0.3 + CAM_OFFSET.y;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camTargetX, 5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camTargetY, 5, dt);
    this.camera.position.z = CAM_OFFSET.z;
    // Look slightly at the ship's lateral position but keep Y level with camera so horizon = center
    this.camera.lookAt(this.ship.position.x * 0.2, this.camera.position.y, LOOK_AHEAD_Z);

    // firing
    this.fireCooldown -= dt;
    if (Input.fire && this.fireCooldown <= 0) {
      this.fireCooldown = FIRE_COOLDOWN;
      const sx = this.ship.position.x;
      const sy = this.ship.position.y;
      const target = this.findNearestEnemy(sx, sy, 1);
      this.spawnLaser(sx - 0.8, sy - 0.05, 1.0, LASER_FORWARD_SPEED, 0x88ffaa, true, target);
      this.spawnLaser(sx + 0.8, sy - 0.05, 1.0, LASER_FORWARD_SPEED, 0x88ffaa, true, target);
      audio.laser();
    }
    // missile fire
    if (Input.missileFireEdge && this.missiles > 0) {
      const target = this.findNearestEnemy(this.ship.position.x, this.ship.position.y, 1);
      if (target) {
        this.missiles -= 1;
        this.spawnMissile(target);
        audio.beep({ freq: 220, slideTo: 880, dur: 0.18, type: 'sawtooth', gain: 0.4 });
      } else {
        audio.beep({ freq: 200, dur: 0.08, type: 'square', gain: 0.2 });
      }
    }

    const dz = -forward * dt;

    this.stars.position.z += dz * 0.15;
    if (this.stars.position.z < -200) this.stars.position.z += 200;
    this.ground.position.z = (this.ground.position.z + dz) % 50;

    // player lasers (homing)
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      // Drop dead targets
      if (l.userData.target && (!l.userData.target.userData || !l.userData.target.userData.alive)) {
        l.userData.target = null;
      }
      // Steer toward target
      const tgt = l.userData.target;
      if (tgt) {
        const dx = tgt.position.x - l.position.x;
        const dy = tgt.position.y - l.position.y;
        const dz = Math.max(0.1, tgt.position.z - l.position.z);
        const desiredVx = (dx / dz) * l.userData.vz;
        const desiredVy = (dy / dz) * l.userData.vz;
        const k = 1 - Math.exp(-HOMING_TURN * dt);
        l.userData.vx += (desiredVx - l.userData.vx) * k;
        l.userData.vy += (desiredVy - l.userData.vy) * k;
        // cap lateral velocity so lasers can't loop back
        const cap = l.userData.vz * 1.2;
        l.userData.vx = THREE.MathUtils.clamp(l.userData.vx, -cap, cap);
        l.userData.vy = THREE.MathUtils.clamp(l.userData.vy, -cap, cap);
      }
      l.position.z += l.userData.vz * dt;
      l.position.x += l.userData.vx * dt;
      l.position.y += l.userData.vy * dt;
      l.userData.life -= dt;
      if (l.userData.life <= 0 || l.position.z > 600) {
        this.scene.remove(l); this.lasers.splice(i, 1);
      }
    }

    // missiles
    for (let i = this.missileProjs.length - 1; i >= 0; i--) {
      const m = this.missileProjs[i];
      const ud = m.userData;
      if (ud.target && (!ud.target.userData || !ud.target.userData.alive)) {
        // pick a new target if previous died
        ud.target = this.findNearestEnemy(m.position.x, m.position.y, m.position.z);
      }
      if (ud.target) {
        const desired = new THREE.Vector3()
          .copy(ud.target.position).sub(m.position).normalize().multiplyScalar(MISSILE_FORWARD_SPEED);
        const k = 1 - Math.exp(-MISSILE_TURN * dt);
        ud.vel.lerp(desired, k);
        // keep speed roughly constant
        ud.vel.setLength(MISSILE_FORWARD_SPEED);
      }
      m.position.addScaledVector(ud.vel, dt);
      // orient missile along velocity
      const look = new THREE.Vector3().copy(m.position).add(ud.vel);
      m.lookAt(look);
      // flame flicker
      ud.flame.scale.setScalar(0.8 + Math.random() * 0.4);
      ud.life -= dt;
      // hit test against enemies (one-shot kill)
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (!e.userData.alive) continue;
        const d = m.position.distanceTo(e.position);
        if (d < 1.6) {
          this.spawnExplosion(e.position, 0xffcc44);
          e.userData.alive = false;
          this.scene.remove(e); this.enemies.splice(j, 1);
          this.score += 100;
          hit = true;
          break;
        }
      }
      if (hit || ud.life <= 0 || m.position.z < -20 || m.position.z > 700) {
        this.scene.remove(m); this.missileProjs.splice(i, 1);
      }
    }

    // enemy shots: move with world plus their own velocity (negative = toward player)
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const l = this.enemyShots[i];
      l.position.z += dz + l.userData.vz * dt;
      l.userData.life -= dt;
      if (l.userData.life <= 0 || l.position.z < -10) {
        this.scene.remove(l); this.enemyShots.splice(i, 1); continue;
      }
      const dx = l.position.x - this.ship.position.x;
      const dy = l.position.y - this.ship.position.y;
      const dzp = l.position.z;
      if (Math.abs(dzp) < 1.2 && (dx*dx + dy*dy) < (SHIP_HIT_RADIUS * SHIP_HIT_RADIUS)) {
        if (this.rollTime > 0 || this.loopTime > 0) {
          this.score += 5;
          audio.deflect();
        } else {
          this.shield -= 12;
          this.spawnExplosion(l.position, 0xff6688);
          audio.shieldHit();
          if (this.shield <= 0) this.die();
        }
        this.scene.remove(l); this.enemyShots.splice(i, 1);
      }
    }

    // spawn enemies / obstacles
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.4, 1.6 - this.distance / 4000);
      this.spawnEnemy();
      if (Math.random() < 0.3) this.spawnEnemy();
    }
    this.obstacleTimer -= dt;
    if (this.obstacleTimer <= 0) {
      this.obstacleTimer = 0.7 + Math.random() * 0.9;
      this.spawnObstacle();
    }

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.position.z += dz + (-e.userData.approachSpeed) * dt;
      e.userData.driftPhase += dt;
      e.position.x += Math.cos(e.userData.driftPhase * 1.3) * dt * 3;
      e.position.y += Math.sin(e.userData.driftPhase * 1.0) * dt * 2;
      e.rotation.z += dt * 1.5;

      e.userData.shootCooldown -= dt;
      if (e.userData.shootCooldown <= 0 && e.position.z > 8 && e.position.z < 200) {
        e.userData.shootCooldown = 1.5 + Math.random() * 1.5;
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff5577 }),
        );
        m.position.copy(e.position);
        m.userData = { vz: -90, life: 4 };
        this.scene.add(m);
        this.enemyShots.push(m);
      }

      if (e.position.z < -20) { this.scene.remove(e); this.enemies.splice(i, 1); continue; }

      // player lasers vs enemy
      for (let j = this.lasers.length - 1; j >= 0; j--) {
        const l = this.lasers[j];
        const dx = l.position.x - e.position.x;
        const dy = l.position.y - e.position.y;
        const dzp = l.position.z - e.position.z;
        if (Math.abs(dzp) < 1.5 && dx*dx + dy*dy < 1.6) {
          e.userData.hp -= 1;
          this.scene.remove(l); this.lasers.splice(j, 1);
          audio.enemyHit();
          if (e.userData.hp <= 0) {
            this.spawnExplosion(e.position, 0xffaa44);
            e.userData.alive = false;
            // Random pickup drop
            if (Math.random() < 0.18) {
              const types = ['health', 'shield', 'missile'];
              const type = types[Math.floor(Math.random() * types.length)];
              const drop = this.makeFloatingPickup(type, e.position);
              this.pickups.push(drop);
            }
            this.scene.remove(e); this.enemies.splice(i, 1);
            this.score += 100;
          }
          break;
        }
      }

      // ram
      if (e.position.z > -2 && e.position.z < 2) {
        const dx = e.position.x - this.ship.position.x;
        const dy = e.position.y - this.ship.position.y;
        if ((dx*dx + dy*dy) < (SHIP_HIT_RADIUS + 0.9) * (SHIP_HIT_RADIUS + 0.9) && this.rollTime <= 0 && this.loopTime <= 0) {
          this.shield -= 35;
          this.spawnExplosion(e.position);
          e.userData.alive = false;
          this.scene.remove(e); this.enemies.splice(i, 1);
          if (this.shield <= 0) this.die();
        }
      }
    }

    // obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.position.z += dz;
      if (o.position.z < -20) { this.scene.remove(o); this.obstacles.splice(i, 1); continue; }
      if (o.position.z > -2.5 && o.position.z < 2.5) {
        const dx = o.position.x - this.ship.position.x;
        const top = o.position.y + o.userData.halfH;
        const r = (o.userData.radius || 2) + SHIP_HIT_RADIUS;
        const inY = this.ship.position.y < top - 0.2;
        if (Math.abs(dx) < r && inY && this.rollTime <= 0 && this.loopTime <= 0) {
          this.shield -= 40;
          this.spawnExplosion(new THREE.Vector3(this.ship.position.x, this.ship.position.y, 0));
          this.shipVel.x = -Math.sign(dx || 1) * 18;
          if (this.shield <= 0) this.die();
        }
      }
    }

    // pickups
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer = PICKUP_INTERVAL_MIN + Math.random() * (PICKUP_INTERVAL_MAX - PICKUP_INTERVAL_MIN);
      // weighted: missiles less common
      const r = Math.random();
      const type = r < 0.45 ? 'health' : r < 0.8 ? 'shield' : 'missile';
      this.spawnPickup(type);
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.position.z += dz;
      p.rotation.y += dt * 2;
      if (p.userData.ring) p.userData.ring.rotation.x += dt * 3;
      if (p.position.z < -20) { this.scene.remove(p); this.pickups.splice(i, 1); continue; }
      // collision with ship
      if (p.position.z > -2 && p.position.z < 3) {
        const dx = p.position.x - this.ship.position.x;
        const dy = p.position.y - this.ship.position.y;
        if ((dx*dx + dy*dy) < (SHIP_HIT_RADIUS + 0.7) * (SHIP_HIT_RADIUS + 0.7)) {
          this.applyPickup(p.userData.type);
          this.scene.remove(p); this.pickups.splice(i, 1);
        }
      }
    }

    this.updateParticles(dt);

    // Clear transient pickup message
    if (this._msgClearAt && performance.now() / 1000 > this._msgClearAt) {
      this.hud.msg.textContent = '';
      this._msgClearAt = 0;
    }

    this.hud.score.textContent = this.score.toString();
    this.hud.shield.textContent = Math.max(0, Math.round(this.shield)).toString();
    this.hud.speed.textContent = this.speedMult.toFixed(1) + 'x';
    if (this.hud.missiles) this.hud.missiles.textContent = this.missiles.toString();
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.multiplyScalar(0.96);
      p.userData.life -= dt;
      p.scale.multiplyScalar(0.97);
      if (p.userData.life <= 0) { this.scene.remove(p); this.particles.splice(i, 1); }
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.spawnExplosion(this.ship.position.clone(), 0x88ddff);
    this.scene.remove(this.ship);
    this.hud.msg.textContent = 'SHIP DOWN — press R to restart';
    if (this.hooks.onDeath) this.hooks.onDeath();
  }
}
