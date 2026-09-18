import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModel {
  scene: THREE.Group;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedModel>>();
/** Уже загруженные модели — чтобы создание бойца оставалось синхронным. */
const ready = new Map<string, LoadedModel>();

/** Грузит GLB один раз на URL; повторные вызовы переиспользуют ту же загрузку. */
export function loadModel(url: string): Promise<LoadedModel> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise<LoadedModel>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const loaded = { scene: gltf.scene as THREE.Group };
          ready.set(url, loaded);
          resolve(loaded);
        },
        undefined,
        (error) => reject(error),
      );
    });
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Копия модели с собственным скелетом. Обычный clone() переиспользовал бы кости,
 * и оба бойца двигались бы синхронно — SkeletonUtils.clone разводит скелеты.
 */
export function instantiate(model: LoadedModel): THREE.Group {
  return cloneSkinned(model.scene) as THREE.Group;
}

/** Модель, если она уже загружена. Нет — боец соберётся из примитивов. */
export function getLoaded(url: string): LoadedModel | null {
  return ready.get(url) ?? null;
}

/**
 * Прогрев перед первым боем. Ошибку загрузки глотаем намеренно:
 * без модели боец просто соберётся из примитивов, играть это не мешает.
 */
export function preload(urls: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  const total = urls.length;
  onProgress?.(0, total);
  return Promise.all(
    urls.map((url) =>
      loadModel(url)
        .catch(() => null)
        .then(() => {
          done += 1;
          onProgress?.(done, total);
        }),
    ),
  ).then(() => undefined);
}
