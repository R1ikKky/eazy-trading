// Keep the last rendered autoscale result in raw series prices. This also works
// with logarithmic/percentage scales, unlike reusing their displayed axis units.
export function createReplayScaleLock() {
  let latest: any = null,
    frozen: any = null;
  return {
    apply(calculate: () => any) {
      if (frozen) return structuredClone(frozen);
      latest = calculate();
      return latest;
    },
    freeze() {
      if (!frozen && latest) frozen = structuredClone(latest);
    },
    release() {
      frozen = null;
    },
    get frozen() {
      return frozen !== null;
    },
  };
}
export function releaseOnPriceAxisReset(
  chart: any,
  container: HTMLElement,
  release: () => void,
  invalidate: () => void,
) {
  container.addEventListener("dblclick", (event: MouseEvent) => {
    const x = event.clientX - container.getBoundingClientRect().left;
    if (
      x < chart.priceScale("left").width() ||
      x > container.clientWidth - chart.priceScale("right").width()
    ) {
      release();
      invalidate();
    }
  });
}
