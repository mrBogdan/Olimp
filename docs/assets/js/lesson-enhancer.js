/* =============================================================
   Lesson Enhancer
   Додаткові покращення для уроків:
   - Кнопка "Показати/Сховати" для блоків розв'язків
   - Позначки для зовнішніх посилань
   ============================================================= */

(function () {
  "use strict";

  function init() {
    // ---- Розв'язки: open/close з анімацією ---------------------
    document.querySelectorAll("details.solution").forEach((details) => {
      const summary = details.querySelector("summary");
      if (!summary) return;

      const setLabel = () => {
        summary.textContent = details.open
          ? "▲ Сховати розв'язок"
          : "▼ Показати розв'язок";
      };
      setLabel();
      details.addEventListener("toggle", setLabel);
    });

    // ---- Зовнішні посилання: target=_blank --------------------
    document.querySelectorAll(".md-content a[href^='http']").forEach((a) => {
      if (a.hostname === window.location.hostname) return;
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(() => init());
  }
})();
