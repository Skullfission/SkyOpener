import * as THREE from 'three';

export const SHIP_HIT_RADIUS = 1.0;

// Simple, easily readable player ship: a small forward-pointing dart with a
// visible wireframe collision sphere so the player always knows the hitbox.
// Faces +Z (forward into the scene). No yaw flip — keep transforms simple.
export function createShip() {
  const group = new THREE.Group();

  const matBody = new THREE.MeshStandardMaterial({
    color: 0x6ff7c8, metalness: 0.4, roughness: 0.4, emissive: 0x114433,
  });
  const matWing = new THREE.MeshStandardMaterial({
    color: 0xff6688, metalness: 0.3, roughness: 0.5, emissive: 0x331122,
  });

  // Body — cone pointing along +Z
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 12), matBody);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Wings — flat box across X
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.45), matWing);
  wing.position.set(0, -0.05, -0.1);
  group.add(wing);

  // Tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.4), matWing);
  fin.position.set(0, 0.22, -0.25);
  group.add(fin);

  // Engine glow
  const engine = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xaaffff }),
  );
  engine.position.set(0, 0, -0.85);
  group.add(engine);
  const glow = new THREE.PointLight(0x88ffee, 1.0, 5);
  glow.position.set(0, 0, -1.1);
  group.add(glow);

  // Visible collision sphere (wireframe) — shows exactly what counts as a hit
  const collider = new THREE.Mesh(
    new THREE.IcosahedronGeometry(SHIP_HIT_RADIUS, 1),
    new THREE.MeshBasicMaterial({ color: 0xffff66, wireframe: true, transparent: true, opacity: 0.35 }),
  );
  group.add(collider);
  group.userData.collider = collider;

  return group;
}

export function createEnemy() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xcc3355, metalness: 0.4, roughness: 0.5, emissive: 0x330011 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), mat);
  body.scale.set(1.2, 0.6, 1.0);
  group.add(body);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.08, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x441122, metalness: 0.7, roughness: 0.3 }),
  );
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
  );
  // Enemies face -Z (toward player), so the eye points toward us
  eye.position.set(0, 0, -0.6);
  group.add(eye);
  return group;
}
