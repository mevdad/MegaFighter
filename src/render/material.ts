import { BLEND_ADDITIVE, BLEND_NORMAL, CULLFACE_NONE, StandardMaterial } from 'playcanvas';
import { hexColor } from './scene';

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  doubleSided?: boolean;
}

/** Общий рецепт непрозрачного PBR-материала — единая точка, где заданы дефолты roughness/metalness. */
export function standardMat(color: number, opts: MatOpts = {}): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse = hexColor(color);
  m.useMetalness = true;
  m.metalness = opts.metalness ?? 0.15;
  m.gloss = 1 - (opts.roughness ?? 0.65);
  if (opts.emissive !== undefined) {
    m.emissive = hexColor(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.doubleSided) m.cull = CULLFACE_NONE;
  m.update();
  return m;
}

/** Немаркий (unlit) материал для аддитивных эффектов: вспышки, кольца, столб света. */
export function glowMat(color: number, opacity: number, additive = true): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse = hexColor(0);
  m.emissive = hexColor(color);
  m.emissiveIntensity = 1;
  m.useLighting = false;
  m.opacity = opacity;
  m.blendType = additive ? BLEND_ADDITIVE : BLEND_NORMAL;
  m.depthWrite = false;
  m.cull = CULLFACE_NONE;
  m.update();
  return m;
}
