/* =============================================================
   Pyodide Runner
   Перетворює <pre><code class="python-runner-code"> у інтерактивний
   Python-редактор з кнопками Run / Copy / Reset.
   Перетворює <pre><code class="task-runner-code"> у task-runner
   з додатковою кнопкою Run Tests і панеллю результатів тестів.
   Pyodide завантажується ліниво — лише при першому запуску.
   ============================================================= */

(function () {
  "use strict";

  const PYODIDE_VERSION = "0.26.2";
  const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

  let pyodideInstance = null;
  let pyodideLoading = null;

  // ---------- Ініціалізація Pyodide (singleton) -----------------
  async function getPyodide() {
    if (pyodideInstance) return pyodideInstance;
    if (pyodideLoading) return pyodideLoading;

    pyodideLoading = (async () => {
      const script = document.createElement("script");
      script.src = `${PYODIDE_CDN}pyodide.js`;
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error("Не вдалося завантажити Pyodide"));
      });
      pyodideInstance = await window.loadPyodide({ indexURL: PYODIDE_CDN });
      return pyodideInstance;
    })();

    return pyodideLoading;
  }

  // ---------- Завантаження тестів зі сторінки ------------------
  function loadTaskTests() {
    const tag = document.querySelector('script[type="application/json"][data-tasks]');
    if (!tag) return {};
    try {
      return JSON.parse(tag.textContent) || {};
    } catch (e) {
      console.error("Не вдалося розпарсити тести:", e);
      return {};
    }
  }

  // ---------- Утиліти ------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(statusEl, text, kind) {
    statusEl.textContent = text;
    statusEl.className = "python-runner__status" + (kind ? " " + kind : "");
  }

  // ===================================================================
  // PYTHON RUNNER (для демонстраційних прикладів)
  // ===================================================================
  function createPythonRunner(source, label) {
    const wrapper = document.createElement("div");
    wrapper.className = "python-runner";
    wrapper.dataset.kind = "python";

    wrapper.innerHTML = `
      <div class="python-runner__header">
        <span class="python-runner__title">${escapeHtml(label || "main.py")}</span>
        <span class="python-runner__status">очікує</span>
      </div>
      <textarea class="python-runner__editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">${escapeHtml(source)}</textarea>
      <div class="python-runner__buttons">
        <button class="python-runner__btn python-runner__btn--run" data-action="run">▶ Run</button>
        <button class="python-runner__btn" data-action="copy">⎘ Copy</button>
        <button class="python-runner__btn" data-action="reset">↻ Reset</button>
      </div>
      <pre class="python-runner__output"></pre>
    `;

    const editor = wrapper.querySelector(".python-runner__editor");
    const output = wrapper.querySelector(".python-runner__output");
    const status = wrapper.querySelector(".python-runner__status");

    wrapper.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      if (action === "run") runPythonCode(wrapper, editor.value, output, status);
      else if (action === "copy") navigator.clipboard.writeText(editor.value).then(() => {
        const orig = e.target.textContent;
        e.target.textContent = "✓ Скопійовано";
        setTimeout(() => (e.target.textContent = orig), 1200);
      });
      else if (action === "reset") {
        editor.value = source;
        output.innerHTML = "";
        setStatus(status, "скинуто");
      }
    });

    editor.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runPythonCode(wrapper, editor.value, output, status);
      }
    });

    return wrapper;
  }

  async function runPythonCode(wrapper, code, output, status) {
    setStatus(status, "завантаження Python…", "loading");
    try {
      const pyodide = await getPyodide();
      setStatus(status, "виконання…", "loading");

      let stdoutBuf = "", stderrBuf = "";
      pyodide.setStdout({ batched: (t) => (stdoutBuf += t + "\n") });
      pyodide.setStderr({ batched: (t) => (stderrBuf += t + "\n") });

      try {
        await pyodide.runPythonAsync(code);
      } catch (err) {
        stderrBuf += String(err) + "\n";
      }

      output.innerHTML = "";
      if (stdoutBuf) {
        const span = document.createElement("span");
        span.className = "stdout";
        span.textContent = stdoutBuf.replace(/\n$/, "");
        output.appendChild(span);
      }
      if (stderrBuf) {
        const span = document.createElement("span");
        span.className = "stderr";
        span.textContent = stderrBuf.replace(/\n$/, "");
        if (stdoutBuf) output.appendChild(document.createTextNode("\n"));
        output.appendChild(span);
        setStatus(status, "помилка", "error");
      } else {
        setStatus(status, "готово ✓", "ready");
      }
    } catch (err) {
      output.innerHTML = "";
      const span = document.createElement("span");
      span.className = "stderr";
      span.textContent = "Не вдалося запустити Python: " + err.message;
      output.appendChild(span);
      setStatus(status, "помилка", "error");
    }
  }

  // ===================================================================
  // TASK RUNNER (для задач з тестами)
  // ===================================================================
  function createTaskRunner(source, label, taskId, tests) {
    const wrapper = document.createElement("div");
    wrapper.className = "python-runner python-runner--task";
    wrapper.dataset.kind = "task";
    wrapper.dataset.taskId = taskId || "";

    const testsInfo = tests && tests.length
      ? `<span class="python-runner__tests-info">${tests.length} ${pluralize(tests.length, "тест", "тести", "тестів")}</span>`
      : `<span class="python-runner__tests-info python-runner__tests-info--warn">тести не знайдено</span>`;

    wrapper.innerHTML = `
      <div class="python-runner__header">
        <span class="python-runner__title">${escapeHtml(label || "task.py")}</span>
        <span class="python-runner__status">очікує</span>
        ${testsInfo}
      </div>
      <textarea class="python-runner__editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">${escapeHtml(source)}</textarea>
      <div class="python-runner__buttons">
        <button class="python-runner__btn python-runner__btn--run" data-action="run">▶ Run</button>
        <button class="python-runner__btn python-runner__btn--tests" data-action="tests" ${!tests || !tests.length ? "disabled" : ""}>▶▶ Run Tests</button>
        <button class="python-runner__btn" data-action="copy">⎘ Copy</button>
        <button class="python-runner__btn" data-action="reset">↻ Reset</button>
      </div>
      <pre class="python-runner__output"></pre>
      <div class="python-runner__results" hidden></div>
    `;

    const editor = wrapper.querySelector(".python-runner__editor");
    const output = wrapper.querySelector(".python-runner__output");
    const results = wrapper.querySelector(".python-runner__results");
    const status = wrapper.querySelector(".python-runner__status");

    wrapper.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      if (action === "run") {
        runPythonCode(wrapper, editor.value, output, status);
        results.hidden = true;
      } else if (action === "tests") {
        if (!tests || !tests.length) return;
        runTaskTests(wrapper, editor.value, tests, output, results, status);
      } else if (action === "copy") navigator.clipboard.writeText(editor.value).then(() => {
        const orig = e.target.textContent;
        e.target.textContent = "✓ Скопійовано";
        setTimeout(() => (e.target.textContent = orig), 1200);
      });
      else if (action === "reset") {
        editor.value = source;
        output.innerHTML = "";
        results.innerHTML = "";
        results.hidden = true;
        setStatus(status, "скинуто");
      }
    });

    editor.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (tests && tests.length) {
          runTaskTests(wrapper, editor.value, tests, output, results, status);
        } else {
          runPythonCode(wrapper, editor.value, output, status);
        }
      }
    });

    return wrapper;
  }

  // ---------- Запуск тестів -------------------------------------
  async function runTaskTests(wrapper, code, tests, output, resultsEl, status) {
    setStatus(status, "завантаження Python…", "loading");
    resultsEl.hidden = false;
    resultsEl.innerHTML = `<div class="task-runner__progress">завантаження Python…</div>`;

    try {
      const pyodide = await getPyodide();
      setStatus(status, `виконання ${tests.length} ${pluralize(tests.length, "тесту", "тестів", "тестів")}…`, "loading");
      resultsEl.innerHTML = `<div class="task-runner__progress">виконання тестів…</div>`;

      const testResults = [];
      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        const res = await runSingleTest(pyodide, code, test);
        testResults.push(res);
        // Інкрементальне оновлення
        renderResults(resultsEl, testResults, tests.length);
      }

      const passed = testResults.filter((r) => r.pass).length;
      setStatus(
        status,
        passed === tests.length ? `усі тести пройдено ✓ (${passed}/${tests.length})` : `пройдено ${passed}/${tests.length}`,
        passed === tests.length ? "ready" : "error"
      );
      renderResults(resultsEl, testResults, tests.length);
    } catch (err) {
      resultsEl.innerHTML = "";
      const div = document.createElement("div");
      div.className = "task-runner__fatal";
      div.textContent = "Не вдалося запустити Python: " + err.message;
      resultsEl.appendChild(div);
      setStatus(status, "помилка", "error");
    }
  }

  async function runSingleTest(pyodide, code, test) {
    // Pyodide 0.26: stdin() повертає ЦІЛИЙ РЯДОК (а не символ).
    // input() у Python зчитує один рядок за виклик stdin().
    // Розбиваємо вхідні дані по \n і повертаємо по одному рядку.
    const lines = (test.input || "").split("\n").filter((l) => l.length > 0);
    let idx = 0;
    pyodide.setStdin({
      stdin: () => (idx < lines.length ? lines[idx++] : null),
      autoEOF: true,  // EOF після кожного рядка
    });

    // Перехоплюємо stdout/stderr
    let stdout = "", stderr = "";
    pyodide.setStdout({ batched: (t) => (stdout += t + "\n") });
    pyodide.setStderr({ batched: (t) => (stderr += t + "\n") });

    // Ізольований namespace — кожен тест з чистого аркуша
    const ns = pyodide.globals.get("dict")();
    let runtimeError = null;
    try {
      await pyodide.runPythonAsync(code, { globals: ns });
    } catch (err) {
      runtimeError = String(err);
    }
    try { ns.destroy(); } catch (_) {}

    const actual = stdout.replace(/\n$/, "").trim();
    const expected = String(test.expected ?? "").replace(/\n$/, "").trim();

    let pass = false;
    let reason = "";
    if (runtimeError) {
      reason = "runtime_error";
    } else if (actual === expected) {
      pass = true;
    } else {
      reason = "wrong_output";
    }

    return {
      input: test.input || "",
      expected,
      actual,
      stderr: stderr.replace(/\n$/, ""),
      error: runtimeError,
      pass,
      reason,
    };
  }

  function renderResults(container, results, total) {
    container.innerHTML = "";
    const summary = document.createElement("div");
    const passed = results.filter((r) => r.pass).length;
    summary.className = "task-runner__summary " + (passed === total ? "task-runner__summary--pass" : "task-runner__summary--fail");
    summary.textContent = passed === total
      ? `✓ Усі тести пройдено (${passed}/${total})`
      : `Пройдено ${passed} з ${total} тестів`;
    container.appendChild(summary);

    results.forEach((r, i) => {
      const item = document.createElement("details");
      item.className = "task-runner__test " + (r.pass ? "task-runner__test--pass" : "task-runner__test--fail");
      item.open = !r.pass;  // Розкриваємо тільки невдалі

      const head = document.createElement("summary");
      head.innerHTML = `<span class="task-runner__test-icon">${r.pass ? "✓" : "✗"}</span> Тест ${i + 1}`;
      item.appendChild(head);

      const body = document.createElement("div");
      body.className = "task-runner__test-body";

      if (r.input) {
        body.appendChild(makeKv("Вхід", r.input));
      }
      body.appendChild(makeKv("Очікувано", r.expected || "(порожньо)"));
      if (r.error) {
        const err = document.createElement("div");
        err.className = "task-runner__kv task-runner__kv--error";
        err.innerHTML = `<span class="task-runner__kv-key">Помилка:</span> <pre class="task-runner__kv-pre">${escapeHtml(r.error)}</pre>`;
        body.appendChild(err);
      } else {
        body.appendChild(makeKv("Отримано", r.actual || "(порожньо)", !r.pass));
      }
      if (r.stderr) {
        body.appendChild(makeKv("stderr", r.stderr, true));
      }

      item.appendChild(body);
      container.appendChild(item);
    });
  }

  function makeKv(key, value, isError = false) {
    const wrap = document.createElement("div");
    wrap.className = "task-runner__kv" + (isError ? " task-runner__kv--error" : "");
    const k = document.createElement("span");
    k.className = "task-runner__kv-key";
    k.textContent = key + ":";
    const v = document.createElement("pre");
    v.className = "task-runner__kv-pre";
    v.textContent = value;
    wrap.appendChild(k);
    wrap.appendChild(v);
    return wrap;
  }

  function pluralize(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ---------- Ініціалізація ------------------------------------
  function init() {
    const taskTests = loadTaskTests();

    document.querySelectorAll("pre > code.python-runner-code, pre.python-runner-code > code").forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre || pre.dataset.runnerReady === "1") return;
      const source = codeEl.textContent;
      const label = codeEl.getAttribute("data-label") || "main.py";
      const runner = createPythonRunner(source, label);
      pre.replaceWith(runner);
    });

    document.querySelectorAll("pre > code.task-runner-code, pre.task-runner-code > code").forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre || pre.dataset.runnerReady === "1") return;
      const source = codeEl.textContent;
      // mkdocs-material перезаписує `id` на власні __code_N, тому
      // використовуємо data-task-id (або fallback на id)
      const taskId =
        codeEl.getAttribute("data-task-id") ||
        pre.getAttribute("data-task-id") ||
        codeEl.getAttribute("id") ||
        pre.getAttribute("id") ||
        "";
      const label = codeEl.getAttribute("data-label") || "task.py";
      const tests = taskTests[taskId] || [];
      const runner = createTaskRunner(source, label, taskId, tests);
      pre.replaceWith(runner);
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
