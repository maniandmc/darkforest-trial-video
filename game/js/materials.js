// Shared materials (greybox look for stage 1; stage 3 swaps in textures and lava shaders).
import * as THREE from 'three';

export function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    cloak: std({ color: 0x2a2826, roughness: 0.95 }),
    playerDark: std({ color: 0x050505, roughness: 1 }),
    steel: std({ color: 0x6a6460, roughness: 0.4, metalness: 0.8 }),
    blade: std({ color: 0xb8b2a8, roughness: 0.25, metalness: 0.9, emissive: 0x000000 }),
    flask: std({ color: 0xffa040, emissive: 0xff8a20, emissiveIntensity: 2.5, roughness: 0.2 }),
    bossSkin: std({ color: 0x6b6560, roughness: 0.85 }),
    bossHorn: std({ color: 0x3a3632, roughness: 0.6 }),
    bone: std({ color: 0xc8bca8, roughness: 0.6 }),
    socket: std({ color: 0x050302, roughness: 1 }),
    bossEye: std({ color: 0xff7a20, emissive: 0xff6a10, emissiveIntensity: 4 }),
    floor: std({ color: 0x4a4744, roughness: 0.95 }),
    wall: std({ color: 0x35322f, roughness: 1 }),
  };
}
