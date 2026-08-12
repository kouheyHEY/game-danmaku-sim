export const MAX_RENDER_RESOLUTION = 4;

/** CSS拡大率と端末DPIに合わせ、全画面でも論理解像度を粗く見せない。 */
export function renderResolutionForViewport(cssScale: number, devicePixelRatio: number): number {
  const safeScale = Number.isFinite(cssScale) && cssScale > 0 ? cssScale : 1;
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(MAX_RENDER_RESOLUTION, Math.max(1, safeScale * safeDpr));
}
