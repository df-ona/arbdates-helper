(async function () {
  "use strict";

  if (document.getElementById("arbdates-helper-root")) return;

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

  // ─── Fetch helpers ───────────────────────────────────────────────────────────

  async function fetchArbitratorList() {
    const resp = await fetch("https://www.arbdates.com/on/arbitrators");
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
    return Array.from(doc.querySelectorAll("ul.names li a")).map((a) => ({
      name: a.textContent.trim(),
      url: a.href,
    }));
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

    let html = `
      <div class="cal-nav">
        <button class="cal-nav-btn" id="cal-prev">&#8249;</button>
        <span class="cal-month-label">${monthNames[month]} ${year}</span>
        <button class="cal-nav-btn" id="cal-next">&#8250;</button>
      </div>
      <div class="cal-grid">
        ${dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join("")}
    `;

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell cal-empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const isSel = selectedDates.has(ymd);
      html += `<div class="cal-cell${isSel ? " cal-selected" : ""}" data-date="${ymd}">${d}</div>`;
    }

    html += `</div>`;
    const count = selectedDates.size;
    html += `<div class="cal-summary">${count === 0 ? "No dates selected" : `${count} date${count !== 1 ? "s" : ""} selected`}</div>`;
    html += `<button class="arb-btn arb-btn-secondary cal-clear-btn" id="cal-clear-dates">Clear dates</button>`;

    calEl.innerHTML = html;

    calEl.querySelector("#cal-prev").addEventListener("click", (e) => {
      e.stopPropagation();
      calView.month--;
      if (calView.month < 0) { calView.month = 11; calView.year--; }
      renderCalendar(calEl);
    });
    calEl.querySelector("#cal-next").addEventListener("click", (e) => {
      e.stopPropagation();
      calView.month++;
      if (calView.month > 11) { calView.month = 0; calView.year++; }
      renderCalendar(calEl);
    });
    calEl.querySelector("#cal-clear-dates").addEventListener("click", (e) => {
      e.stopPropagation();
      selectedDates.clear();
      rangeAnchor = null;
      renderCalendar(calEl);
      updateRunBtn();
    });

    calEl.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        const date = cell.dataset.date;
        if (e.shiftKey && rangeAnchor) {
          const a = fromYMD(rangeAnchor);
          const b = fromYMD(date);
          const [start, end] = a <= b ? [a, b] : [b, a];
          let cur = new Date(start);
          while (cur <= end) { selectedDates.add(toYMD(cur)); cur.setDate(cur.getDate() + 1); }
        } else {
          if (selectedDates.has(date)) { selectedDates.delete(date); }
          else { selectedDates.add(date); rangeAnchor = date; }
        }
        renderCalendar(calEl);
        updateRunBtn();
      });

      cell.addEventListener("mouseenter", (e) => {
        if (!e.shiftKey || !rangeAnchor) return;
        const a = fromYMD(rangeAnchor);
        const b = fromYMD(cell.dataset.date);
        const [start, end] = a <= b ? [a, b] : [b, a];
        calEl.querySelectorAll(".cal-cell[data-date]").forEach((c) => {
          const cd = fromYMD(c.dataset.date);
          c.classList.toggle("cal-hover-range", cd >= start && cd <= end);
        });
      });
    });

    calEl.addEventListener("mouseleave", () => {
      calEl.querySelectorAll(".cal-hover-range").forEach(c => c.classList.remove("cal-hover-range"));
    });
  }

  // ─── Build panel ─────────────────────────────────────────────────────────────

  function buildPanel() {
    const root = document.createElement("div");
    root.id = "arbdates-helper-root";
    root.innerHTML = `
      <div id="arbdates-panel">
        <div id="arbdates-header">
          <div class="arb-title"><span class="arb-dot"></span>ArbDates Helper</div>
          <div id="arbdates-header-btns">
            <button id="arb-collapse-btn" title="Collapse">─</button>
            <button id="arb-close-btn" title="Close">✕</button>
          </div>
        </div>
        <div id="arbdates-body">
          <div>
            <div class="arb-section-label">1 · Select Arbitrators</div>
            <input id="arb-search" type="text" placeholder="Search by name…" autocomplete="off" />
            <div style="margin-top:6px;" id="arb-list-container">
              <div class="arb-list-empty">Loading arbitrators…</div>
            </div>
            <div class="arb-quick-row">
              <button class="arb-btn arb-btn-secondary" id="arb-select-all-btn">Select all</button>
              <button class="arb-btn arb-btn-secondary" id="arb-clear-btn">Clear</button>
              <span id="arb-selected-count"></span>
            </div>
          </div>
          <div>
            <div class="arb-section-label">2 · Select Dates</div>
            <div class="cal-hint">Click to toggle individual dates &nbsp;·&nbsp; Shift+click to fill a range</div>
            <div id="arb-calendar"></div>
          </div>
          <div>
            <button class="arb-btn arb-btn-primary" id="arb-run-btn" disabled>Check Availability</button>
            <div id="arb-status" style="margin-top:8px;"></div>
          </div>
          <div id="arb-output-section">
            <div class="arb-section-label">3 · Email-Ready Output</div>
            <textarea id="arb-output" readonly></textarea>
            <button class="arb-btn arb-btn-secondary" id="arb-copy-btn" style="margin-top:8px;width:100%;background:#1a1a2e;color:#fff;">📋 Copy to Clipboard</button>
          </div>
        </div>
      </div>
    `;
    return root;
  }

  function makeDraggable(panel, handle) {
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener("mousedown", (e) => { dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; e.preventDefault(); });
    document.addEventListener("mousemove", (e) => { if (!dragging) return; panel.style.left = e.clientX - ox + "px"; panel.style.top = e.clientY - oy + "px"; panel.style.right = "auto"; });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  const root         = buildPanel();
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
  closeBtn.addEventListener("click", () => root.remove());

  // ─── Arbitrator list ─────────────────────────────────────────────────────────

  let allArbitrators = [];
  let selectedUrls = new Set();

  function renderList(filter = "") {
    const filtered = filter
      ? allArbitrators.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
      : allArbitrators;

    if (filtered.length === 0) {
      listContainer.innerHTML = `<div class="arb-list-empty">No results found.</div>`;
      return;
    }

    listContainer.innerHTML = "";
    filtered.forEach(({ name, url }) => {
      const item = document.createElement("div");
      item.className = "arb-item" + (selectedUrls.has(url) ? " selected" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedUrls.has(url);

      const lbl = document.createElement("span");
      lbl.textContent = name;
      lbl.className = "arb-item-label";

      // Whole row is clickable
      item.addEventListener("click", () => {
        cb.checked = !cb.checked;
        if (cb.checked) { selectedUrls.add(url); item.classList.add("selected"); }
        else { selectedUrls.delete(url); item.classList.remove("selected"); }
        updateSelectedCount();
        updateRunBtn();
      });
      // Prevent double-fire when clicking checkbox directly
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        if (cb.checked) { selectedUrls.add(url); item.classList.add("selected"); }
        else { selectedUrls.delete(url); item.classList.remove("selected"); }
        updateSelectedCount();
        updateRunBtn();
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
    listContainer.innerHTML = `<div class="arb-list-empty">Failed to load arbitrators. Please refresh.</div>`;
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
    statusEl.innerHTML = `<span class="arb-spinner"></span>Checking ${arbsToCheck.length} arbitrator(s)…`;

    try {
      const results = await Promise.all(
        arbsToCheck.map(async ({ name, url }) => {
          const availableDates = await fetchArbitratorDates(url);
          const matched = availableDates.filter((d) => targetDates.includes(d));
          return { name, matched };
        })
      );

      // Build date → [names] map, sorted by date
      const byDate = {};
      targetDates.forEach((d) => { byDate[d] = []; });
      results.forEach(({ name, matched }) => matched.forEach((d) => byDate[d].push(name)));

      const datesWithAvailability = targetDates.filter((d) => byDate[d].length > 0);

      if (datesWithAvailability.length === 0) {
        statusEl.className = "error";
        statusEl.textContent = "No arbitrators are available on any of the selected dates.";
        runBtn.disabled = false;
        return;
      }

      // Email-ready output sorted by date
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
