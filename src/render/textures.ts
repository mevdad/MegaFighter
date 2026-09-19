import { ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR, PIXELFORMAT_RGBA8, Texture } from 'playcanvas';
import type { GraphicsDevice } from 'playcanvas';

function canvasTexture(device: GraphicsDevice, size: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable — cannot bake particle texture');
  draw(ctx);
  const texture = new Texture(device, {
    width: size,
    height: size,
    format: PIXELFORMAT_RGBA8,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
    magFilter: FILTER_LINEAR,
    minFilter: FILTER_LINEAR,
    mipmaps: false,
  });
  texture.setSource(canvas);
  return texture;
}

/** Мягкая белая точка — искры и пыль тонируются поверх неё через colorGraph частиц. */
export function sparkTexture(device: GraphicsDevice): Texture {
  return canvasTexture(device, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
}

/** Кольцо на прозрачном фоне для плоского ударного эффекта. */
export function ringTexture(device: GraphicsDevice): Texture {
  return canvasTexture(device, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(0.68, 'rgba(255,255,255,1)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}
