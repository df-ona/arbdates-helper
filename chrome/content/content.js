(async function () {
  "use strict";

  // Panel is hidden/shown via toolbar; only build it once
  const existingRoot = document.getElementById("arbdates-helper-root");
  if (existingRoot) {
    existingRoot.style.display = existingRoot.style.display === "none" ? "" : "none";
    return;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function toYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fromYMD(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [y, m, d] = dateStr.split("-");
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "className") node.className = v;
      else if (k === "textContent") node.textContent = v;
      else if (k === "style") Object.assign(node.style, v);
      else node.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    }
    return node;
  }

  // ─── Fetch helpers ───────────────────────────────────────────────────────────

  async function fetchArbitratorList() {
    const resp = await fetch("https://www.arbdates.com/on/arbitrators");
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
    return Array.from(doc.querySelectorAll("ul.names li a")).map((a) => {
      // The raw textContent includes the name and optionally a "b" on a new line
      // e.g. "Atkinson, S.\n  b" — we split, clean, and detect bilingual separately
      const raw = a.textContent;
      const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
      const bilingual = lines.includes("b");
      const name = lines.filter((s) => s !== "b").join(" ").trim();
      return { name, url: a.href, bilingual };
    });
  }

  async function fetchArbitratorDates(arbUrl) {
    await sleep(300);
    const resp = await fetch(arbUrl);
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
    return Array.from(doc.querySelectorAll("#dates-cal [id].a3")).map((el) =>
      el.id.replace(/^d/, "")
    );
  }

  // ─── Calendar widget ─────────────────────────────────────────────────────────

  let selectedDates = new Set();
  let calView = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let rangeAnchor = null;

  function renderCalendar(calEl) {
    const { year, month } = calView;
    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
    const dayNames = ["Su","Mo","Tu","We","Th","Fr","Sa"];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    while (calEl.firstChild) calEl.removeChild(calEl.firstChild);

    const prevBtn = el("button", { className: "cal-nav-btn", id: "cal-prev" }, ["‹"]);
    const nextBtn = el("button", { className: "cal-nav-btn", id: "cal-next" }, ["›"]);
    const monthLabel = el("span", { className: "cal-month-label", textContent: `${monthNames[month]} ${year}` });
    calEl.appendChild(el("div", { className: "cal-nav" }, [prevBtn, monthLabel, nextBtn]));

    const grid = el("div", { className: "cal-grid" });
    dayNames.forEach((d) => grid.appendChild(el("div", { className: "cal-day-name", textContent: d })));
    for (let i = 0; i < firstDay; i++) grid.appendChild(el("div", { className: "cal-cell cal-empty" }));

    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cell = el("div", { className: selectedDates.has(ymd) ? "cal-cell cal-selected" : "cal-cell", textContent: String(d) });
      cell.dataset.date = ymd;

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        const date = cell.dataset.date;
        if (e.shiftKey && rangeAnchor) {
          const a = fromYMD(rangeAnchor), b = fromYMD(date);
          const [start, end] = a <= b ? [a, b] : [b, a];
          let cur = new Date(start);
          while (cur <= end) { selectedDates.add(toYMD(cur)); cur.setDate(cur.getDate() + 1); }
        } else {
          if (selectedDates.has(date)) selectedDates.delete(date);
          else { selectedDates.add(date); rangeAnchor = date; }
        }
        renderCalendar(calEl);
        updateRunBtn();
      });

      cell.addEventListener("mouseenter", (e) => {
        if (!e.shiftKey || !rangeAnchor) return;
        const a = fromYMD(rangeAnchor), b = fromYMD(cell.dataset.date);
        const [start, end] = a <= b ? [a, b] : [b, a];
        calEl.querySelectorAll(".cal-cell[data-date]").forEach((c) => {
          c.classList.toggle("cal-hover-range", fromYMD(c.dataset.date) >= start && fromYMD(c.dataset.date) <= end);
        });
      });

      grid.appendChild(cell);
    }
    calEl.appendChild(grid);

    calEl.addEventListener("mouseleave", () => {
      calEl.querySelectorAll(".cal-hover-range").forEach((c) => c.classList.remove("cal-hover-range"));
    });

    const count = selectedDates.size;
    calEl.appendChild(el("div", { className: "cal-summary", textContent: count === 0 ? "No dates selected" : `${count} date${count !== 1 ? "s" : ""} selected` }));

    const clearDatesBtn = el("button", { className: "arb-btn arb-btn-secondary cal-clear-btn", textContent: "Clear dates" });
    clearDatesBtn.addEventListener("click", (e) => {
      e.stopPropagation(); selectedDates.clear(); rangeAnchor = null; renderCalendar(calEl); updateRunBtn();
    });
    calEl.appendChild(clearDatesBtn);

    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation(); calView.month--;
      if (calView.month < 0) { calView.month = 11; calView.year--; }
      renderCalendar(calEl);
    });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation(); calView.month++;
      if (calView.month > 11) { calView.month = 0; calView.year++; }
      renderCalendar(calEl);
    });
  }

  // ─── Build panel ─────────────────────────────────────────────────────────────

  function buildPanel() {
    const root = el("div", { id: "arbdates-helper-root" });

    const dot = el("div", { className: "arb-dot" });
    const title = el("div", { className: "arb-title" }, [dot, "ArbDates Helper"]);
    const collapseBtn = el("button", { id: "arb-collapse-btn", title: "Collapse", textContent: "─" });
    const closeBtn = el("button", { id: "arb-close-btn", title: "Hide", textContent: "✕" });
    const headerBtns = el("div", { id: "arbdates-header-btns" }, [collapseBtn, closeBtn]);
    const header = el("div", { id: "arbdates-header" }, [title, headerBtns]);

    const sec1Label = el("div", { className: "arb-section-label", textContent: "1 · Select Arbitrators" });
    const legend = el("div", { className: "arb-legend" }, [
      el("span", { className: "arb-legend-dot arb-legend-bilingual" }),
      el("span", { className: "arb-legend-text", textContent: "Bilingual (French available)" }),
    ]);
    const searchInput = el("input", { id: "arb-search", type: "text", placeholder: "Search by name…", autocomplete: "off" });
    const listContainer = el("div", { id: "arb-list-container", style: { marginTop: "6px" } }, [
      el("div", { className: "arb-list-empty", textContent: "Loading arbitrators…" }),
    ]);
    const selectAllBtn = el("button", { className: "arb-btn arb-btn-secondary", id: "arb-select-all-btn", textContent: "Select all" });
    const clearBtn = el("button", { className: "arb-btn arb-btn-secondary", id: "arb-clear-btn", textContent: "Clear" });
    const selectedCount = el("span", { id: "arb-selected-count" });
    const sec1 = el("div", {}, [sec1Label, legend, searchInput, listContainer, el("div", { className: "arb-quick-row" }, [selectAllBtn, clearBtn, selectedCount])]);

    const sec2Label = el("div", { className: "arb-section-label", textContent: "2 · Select Dates" });
    const calHint = el("div", { className: "cal-hint", textContent: "Click to toggle individual dates · Shift+click to fill a range" });
    const calEl = el("div", { id: "arb-calendar" });
    const sec2 = el("div", {}, [sec2Label, calHint, calEl]);

    const runBtn = el("button", { className: "arb-btn arb-btn-primary", id: "arb-run-btn", textContent: "Check Availability" });
    runBtn.disabled = true;
    const statusEl = el("div", { id: "arb-status", style: { marginTop: "8px" } });
    const sec3 = el("div", {}, [runBtn, statusEl]);

    const outputLabel = el("div", { className: "arb-section-label", textContent: "3 · Email-Ready Output" });
    const outputEl = el("textarea", { id: "arb-output", readonly: "" });
    const copyBtn = el("button", { className: "arb-btn arb-btn-secondary", id: "arb-copy-btn", textContent: "📋 Copy to Clipboard",
      style: { marginTop: "8px", width: "100%", background: "#1a1a2e", color: "#fff" } });
    const outputSection = el("div", { id: "arb-output-section" }, [outputLabel, outputEl, copyBtn]);

    const body = el("div", { id: "arbdates-body" }, [sec1, sec2, sec3, outputSection]);
    const panel = el("div", { id: "arbdates-panel" }, [header, body]);
    root.appendChild(panel);
    return root;
  }

  function makeDraggable(panel, handle) {
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener("mousedown", (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; e.preventDefault(); });
    document.addEventListener("mousemove", (e) => { if (!dragging) return; panel.style.left = e.clientX - ox + "px"; panel.style.top = e.clientY - oy + "px"; panel.style.right = "auto"; });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  const root          = buildPanel();
  document.body.appendChild(root);

  const panel         = root.querySelector("#arbdates-panel");
  const header        = root.querySelector("#arbdates-header");
  const collapseBtn   = root.querySelector("#arb-collapse-btn");
  const closeBtn      = root.querySelector("#arb-close-btn");
  const searchInput   = root.querySelector("#arb-search");
  const listContainer = root.querySelector("#arb-list-container");
  const selectedCount = root.querySelector("#arb-selected-count");
  const selectAllBtn  = root.querySelector("#arb-select-all-btn");
  const clearBtn      = root.querySelector("#arb-clear-btn");
  const calEl         = root.querySelector("#arb-calendar");
  const runBtn        = root.querySelector("#arb-run-btn");
  const statusEl      = root.querySelector("#arb-status");
  const outputSection = root.querySelector("#arb-output-section");
  const outputEl      = root.querySelector("#arb-output");
  const copyBtn       = root.querySelector("#arb-copy-btn");

  makeDraggable(panel, header);
  renderCalendar(calEl);

  collapseBtn.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
    collapseBtn.textContent = panel.classList.contains("collapsed") ? "▢" : "─";
  });

  // Close hides the panel; toolbar button will show it again
  closeBtn.addEventListener("click", () => { root.style.display = "none"; });

  // Listen for toolbar toggle message from background script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "TOGGLE_PANEL") {
      root.style.display = root.style.display === "none" ? "" : "none";
    }
  });

  // ─── Arbitrator list ─────────────────────────────────────────────────────────

  let allArbitrators = [];
  let selectedUrls = new Set();

  function renderList(filter = "") {
    const filtered = filter
      ? allArbitrators.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
      : allArbitrators;

    while (listContainer.firstChild) listContainer.removeChild(listContainer.firstChild);

    if (filtered.length === 0) {
      listContainer.appendChild(el("div", { className: "arb-list-empty", textContent: "No results found." }));
      return;
    }

    filtered.forEach(({ name, url, bilingual }) => {
      const item = el("div", { className: selectedUrls.has(url) ? "arb-item selected" : "arb-item" });
      const cb = el("input", { type: "checkbox" });
      cb.checked = selectedUrls.has(url);

      // Name label — bilingual gets a distinct class for colour + a small badge
      const lbl = el("span", { className: bilingual ? "arb-item-label arb-bilingual" : "arb-item-label", textContent: name });
      if (bilingual) {
        const badge = el("span", { className: "arb-bilingual-badge", textContent: "FR" });
        lbl.appendChild(badge);
      }

      item.addEventListener("click", () => {
        cb.checked = !cb.checked;
        if (cb.checked) { selectedUrls.add(url); item.classList.add("selected"); }
        else { selectedUrls.delete(url); item.classList.remove("selected"); }
        updateSelectedCount(); updateRunBtn();
      });
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        if (cb.checked) { selectedUrls.add(url); item.classList.add("selected"); }
        else { selectedUrls.delete(url); item.classList.remove("selected"); }
        updateSelectedCount(); updateRunBtn();
      });

      item.appendChild(cb);
      item.appendChild(lbl);
      listContainer.appendChild(item);
    });
  }

  function updateSelectedCount() {
    const n = selectedUrls.size;
    selectedCount.textContent = n > 0 ? `${n} selected` : "";
  }

  function updateRunBtn() {
    runBtn.disabled = !(selectedUrls.size > 0 && selectedDates.size > 0);
  }

  selectAllBtn.addEventListener("click", () => {
    allArbitrators.forEach(({ url }) => selectedUrls.add(url));
    renderList(searchInput.value); updateSelectedCount(); updateRunBtn();
  });
  clearBtn.addEventListener("click", () => {
    selectedUrls.clear();
    renderList(searchInput.value); updateSelectedCount(); updateRunBtn();
  });
  searchInput.addEventListener("input", () => renderList(searchInput.value));

  try {
    allArbitrators = await fetchArbitratorList();
    renderList();
  } catch (e) {
    while (listContainer.firstChild) listContainer.removeChild(listContainer.firstChild);
    listContainer.appendChild(el("div", { className: "arb-list-empty", textContent: "Failed to load arbitrators. Please refresh." }));
    statusEl.className = "error";
    statusEl.textContent = "Could not load arbitrator list.";
  }

  // ─── Run ─────────────────────────────────────────────────────────────────────

  runBtn.addEventListener("click", async () => {
    const targetDates = Array.from(selectedDates).sort();
    if (targetDates.length === 0) { statusEl.className = "error"; statusEl.textContent = "Please select at least one date."; return; }
    if (targetDates.length > 90)  { statusEl.className = "error"; statusEl.textContent = "Please limit your selection to 90 days or fewer."; return; }

    const arbsToCheck = allArbitrators.filter(({ url }) => selectedUrls.has(url));
    runBtn.disabled = true;
    outputSection.classList.remove("visible");
    statusEl.className = "";
    while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
    const spinner = el("span", { className: "arb-spinner" });
    statusEl.appendChild(spinner);
    statusEl.appendChild(document.createTextNode(`Checking ${arbsToCheck.length} arbitrator(s)…`));

    try {
      const results = await Promise.all(
        arbsToCheck.map(async ({ name, url, bilingual }) => {
          const availableDates = await fetchArbitratorDates(url);
          const matched = availableDates.filter((d) => targetDates.includes(d));
          return { name, bilingual, matched };
        })
      );

      const byDate = {};
      targetDates.forEach((d) => { byDate[d] = []; });
      results.forEach(({ name, bilingual, matched }) =>
        matched.forEach((d) => byDate[d].push(bilingual ? `${name} (FR)` : name))
      );
      const datesWithAvailability = targetDates.filter((d) => byDate[d].length > 0);

      if (datesWithAvailability.length === 0) {
        statusEl.className = "error";
        statusEl.textContent = "No arbitrators are available on any of the selected dates.";
        runBtn.disabled = false;
        return;
      }

      const first = targetDates[0], last = targetDates[targetDates.length - 1];
      const dateLabel = first === last ? formatDateForDisplay(first) : `${formatDateForDisplay(first)} – ${formatDateForDisplay(last)}`;

      let text = `Arbitrator Availability: ${dateLabel}\n`;
      text += "=".repeat(text.trim().length) + "\n\n";
      datesWithAvailability.forEach((d) => {
        text += `${formatDateForDisplay(d)}\n`;
        byDate[d].forEach((name) => { text += `  • ${name}\n`; });
        text += "\n";
      });
      const unavailable = results.filter((r) => r.matched.length === 0);
      if (unavailable.length > 0) {
        text += `─────────────────────────────\n`;
        text += `Not available on any selected date:\n`;
        unavailable.forEach(({ name }) => { text += `  • ${name}\n`; });
      }

      outputEl.value = text.trim();
      outputSection.classList.add("visible");
      statusEl.className = "success";
      statusEl.textContent = `✓ Availability found on ${datesWithAvailability.length} of ${targetDates.length} date(s).`;
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = "Something went wrong. Please try again.";
      console.error("[ArbDates Helper]", e);
    } finally {
      runBtn.disabled = false;
    }
  });

  // ─── Copy ────────────────────────────────────────────────────────────────────

  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(outputEl.value); }
    catch { outputEl.select(); document.execCommand("copy"); }
    copyBtn.textContent = "✓ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 2000);
  });

})();
