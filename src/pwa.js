// Installable web app support. Native desktop and Android shells use the same dist/ build.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((error) => console.warn("Offline app-shell registration was unavailable:", error));
  }, { once: true });
}
