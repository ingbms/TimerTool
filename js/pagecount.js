// Page counts only: no SDK, storage, visitor IDs, timer settings, or URL parameters.
(() => {
  const { hostname, protocol, pathname } = window.location;
  const ownDomain = hostname === "timertool.unobex.de" && ["https:", "http:"].includes(protocol);
  const githubProject = hostname === "ingbms.github.io" && protocol === "https:" && /^\/TimerTool(?:\/|$)/.test(pathname);
  if (!ownDomain && !githubProject) return;

  const pixel = new Image(1, 1);
  pixel.crossOrigin = "anonymous";
  pixel.referrerPolicy = "origin";
  pixel.alt = "";
  pixel.setAttribute("aria-hidden", "true");
  pixel.setAttribute("data-page-counter", "");
  pixel.style.cssText = "position:absolute;pointer-events:none";
  pixel.src = `https://stats-timertool.unobex.de/count?p=${encodeURIComponent(pathname)}`;
  document.body.append(pixel);
})();
