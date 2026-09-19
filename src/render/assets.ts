import { Asset, AssetListLoader, type AnimTrack, type AppBase, type ContainerResource, type Entity } from 'playcanvas';

/** ContainerResource.animations существует в рантайме, но не описан в типах движка. */
type ContainerResourceWithAnimations = ContainerResource & { animations: Asset[] };

export interface LoadedContainer {
  /** Клипы модели по имени → секунды длительности, для калибровочных проверок в консоли. */
  clipNames: string[];
  instantiate(): Entity;
  clip(name: string): Asset;
}

const cache = new Map<string, Promise<LoadedContainer>>();
/** Уже загруженные контейнеры — чтобы создание бойца оставалось синхронным. */
const ready = new Map<string, LoadedContainer>();

/** Грузит GLB как container-ассет один раз на URL; повторные вызовы переиспользуют загрузку. */
export function loadContainer(app: AppBase, url: string): Promise<LoadedContainer> {
  let pending = cache.get(url);
  if (!pending) {
    const asset = new Asset(url, 'container', { url });
    pending = new Promise<LoadedContainer>((resolve, reject) => {
      new AssetListLoader([asset], app.assets).load(() => {
        if (!asset.resource) {
          reject(new Error(`Не удалось загрузить контейнер: ${url}`));
          return;
        }
        const resource = asset.resource as ContainerResourceWithAnimations;
        const animations = resource.animations;
        // Asset.name у клипов — синтетический путь ("model.glb/animation/0"), настоящее имя
        // из glTF лежит в AnimTrack.resource.name (см. glb-parser.js: createAnimation()).
        const clipName = (a: Asset): string => (a.resource as AnimTrack | null)?.name ?? a.name;
        const loaded: LoadedContainer = {
          clipNames: animations.map(clipName),
          instantiate: () => resource.instantiateRenderEntity({ castShadows: true }) as Entity,
          clip: (name: string) => {
            const found = animations.find((a) => clipName(a) === name);
            if (!found) {
              throw new Error(`В ${url} нет клипа «${name}»; доступны: ${animations.map(clipName).join(', ')}`);
            }
            return found;
          },
        };
        ready.set(url, loaded);
        resolve(loaded);
      });
    });
    cache.set(url, pending);
  }
  return pending;
}

/** Контейнер, если он уже загружен. Нет — боец соберётся из примитивов. */
export function getLoadedContainer(url: string): LoadedContainer | null {
  return ready.get(url) ?? null;
}

/**
 * Прогрев перед первым боем. Ошибку загрузки глотаем намеренно:
 * без модели боец просто соберётся из примитивов, играть это не мешает.
 */
export function preload(app: AppBase, urls: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  const total = urls.length;
  onProgress?.(0, total);
  return Promise.all(
    urls.map((url) =>
      loadContainer(app, url)
        .catch(() => null)
        .then(() => {
          done += 1;
          onProgress?.(done, total);
        }),
    ),
  ).then(() => undefined);
}
