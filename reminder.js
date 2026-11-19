/* FOG File — client-side pump-out reminder and manifest log. Data stays in localStorage. */
(function () {
  const KEY = "fogfile-v1";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { devices: [], logs: [] };
      const data = JSON.parse(raw);
      return {
        devices: Array.isArray(data.devices) ? data.devices : [],
        logs: Array.isArray(data.logs) ? data.logs : []
      };
    } catch (e) {
      return { devices: [], logs: [] };
    }
  }
  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function todayISO() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function addDays(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + Number(days));
    const z = (n) => String(n).padStart(2, "0");
    return dt.getFullYear() + "-" + z(dt.getMonth() + 1) + "-" + z(dt.getDate());
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function daysUntil(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - today) / 86400000);
  }
  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function val(form, name) {
    const el = form.elements[name];
    return el ? String(el.value || "").trim() : "";
  }

  const root = document.getElementById("fog-app");
  if (!root) return;

  function render() {
    const data = load();
    const devicesHtml = data.devices.length
      ? data.devices
          .map((dev) => {
            const due = dev.lastPumped && dev.intervalDays
              ? addDays(dev.lastPumped, dev.intervalDays)
              : dev.nextDue || "";
            const left = daysUntil(due);
            let badge = '<span class="badge">No schedule yet</span>';
            let dueLabel = "Set a last pump-out date and interval to see the next due date.";
            if (due && left !== null) {
              if (left < 0) {
                badge = '<span class="badge over">Overdue by ' + Math.abs(left) + " day" + (Math.abs(left) === 1 ? "" : "s") + "</span>";
                dueLabel = "Next due: " + fmtDate(due);
              } else if (left <= 14) {
                badge = '<span class="badge soon">Due in ' + left + " day" + (left === 1 ? "" : "s") + "</span>";
                dueLabel = "Next due: " + fmtDate(due);
              } else {
                badge = '<span class="badge ok">Due in ' + left + " days</span>";
                dueLabel = "Next due: " + fmtDate(due);
              }
            }
            const logs = data.logs.filter((l) => l.deviceId === dev.id).sort((a, b) => (a.date < b.date ? 1 : -1));
            const logRows = logs.length
              ? logs
                  .map(
                    (l) =>
                      '<div class="log-item"><strong>' +
                      escapeHtml(fmtDate(l.date)) +
                      "</strong> · " +
                      escapeHtml(l.hauler || "Hauler not recorded") +
                      (l.gallons ? " · " + escapeHtml(l.gallons) + " gal" : "") +
                      (l.manifestNo ? " · Manifest " + escapeHtml(l.manifestNo) : "") +
                      (l.notes ? '<div class="muted">' + escapeHtml(l.notes) + "</div>" : "") +
                      '<div class="muted no-print"><button class="linkish" data-edit-log="' +
                      l.id +
                      '">Edit</button> · <button class="linkish" data-del-log="' +
                      l.id +
                      '">Delete</button></div></div>'
                  )
                  .join("")
              : '<p class="muted">No pump-out records yet for this device.</p>';
            return (
              '<article class="device" data-device="' +
              dev.id +
              '"><header><div><h3>' +
              escapeHtml(dev.name || "Untitled device") +
              "</h3><div class=\"muted\">" +
              escapeHtml([dev.business, dev.address, dev.city].filter(Boolean).join(" · ")) +
              (dev.kind ? " · " + escapeHtml(dev.kind) : "") +
              (dev.size ? " · " + escapeHtml(dev.size) : "") +
              "</div></div><div>" +
              badge +
              "</div></header><p class=\"muted\">Last pumped: " +
              fmtDate(dev.lastPumped) +
              (dev.intervalDays ? " · Interval: every " + escapeHtml(String(dev.intervalDays)) + " days" : "") +
              "<br>" +
              dueLabel +
              '</p><div class="actions-row no-print">' +
              '<button class="btn secondary" type="button" data-edit-device="' +
              dev.id +
              '">Edit device</button>' +
              '<button class="btn" type="button" data-add-log="' +
              dev.id +
              '">Add pump-out</button>' +
              (due ? '<button class="btn secondary" type="button" data-ics="' + dev.id + '">Add due date to calendar</button>' : "") +
              '<button class="linkish" type="button" data-del-device="' +
              dev.id +
              '">Remove device</button></div>' +
              "<h4>Pump-out log</h4>" +
              logRows +
              "</article>"
            );
          })
          .join("")
      : '<p class="muted">No devices yet. Add a grease trap or interceptor below. Everything you enter stays in this browser.</p>';

    $("#device-list", root).innerHTML = devicesHtml;
    $("#device-count", root).textContent = data.devices.length
      ? data.devices.length + (data.devices.length === 1 ? " device saved on this browser." : " devices saved on this browser.")
      : "Nothing stored yet.";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fillDeviceForm(dev) {
    const form = $("#device-form");
    form.elements.id.value = dev ? dev.id : "";
    form.elements.name.value = dev ? dev.name || "" : "";
    form.elements.business.value = dev ? dev.business || "" : "";
    form.elements.address.value = dev ? dev.address || "" : "";
    form.elements.city.value = dev ? dev.city || "" : "";
    form.elements.kind.value = dev ? dev.kind || "" : "";
    form.elements.size.value = dev ? dev.size || "" : "";
    form.elements.location.value = dev ? dev.location || "" : "";
    form.elements.lastPumped.value = dev ? dev.lastPumped || "" : "";
    form.elements.intervalDays.value = dev ? dev.intervalDays || "90" : "90";
    $("#device-form-title").textContent = dev ? "Edit device" : "Add a device";
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillLogForm(deviceId, log) {
    const form = $("#log-form");
    const data = load();
    const dev = data.devices.find((d) => d.id === deviceId) || data.devices.find((d) => d.id === (log && log.deviceId));
    form.elements.id.value = log ? log.id : "";
    form.elements.deviceId.value = log ? log.deviceId : deviceId;
    form.elements.date.value = log ? log.date || todayISO() : todayISO();
    form.elements.hauler.value = log ? log.hauler || "" : "";
    form.elements.phone.value = log ? log.phone || "" : "";
    form.elements.gallons.value = log ? log.gallons || "" : "";
    form.elements.manifestNo.value = log ? log.manifestNo || "" : "";
    form.elements.greasePct.value = log ? log.greasePct || "" : "";
    form.elements.solidsPct.value = log ? log.solidsPct || "" : "";
    form.elements.disposal.value = log ? log.disposal || "" : "";
    form.elements.cost.value = log ? log.cost || "" : "";
    form.elements.notes.value = log ? log.notes || "" : "";
    $("#log-form-title").textContent = (log ? "Edit pump-out" : "Add pump-out") + (dev ? " · " + (dev.name || "device") : "");
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#add-device").addEventListener("click", () => fillDeviceForm(null));
  $("#cancel-device").addEventListener("click", () => { $("#device-form").hidden = true; });
  $("#cancel-log").addEventListener("click", () => { $("#log-form").hidden = true; });

  $("#device-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = load();
    const rec = {
      id: val(form, "id") || uid(),
      name: val(form, "name"),
      business: val(form, "business"),
      address: val(form, "address"),
      city: val(form, "city"),
      kind: val(form, "kind"),
      size: val(form, "size"),
      location: val(form, "location"),
      lastPumped: val(form, "lastPumped"),
      intervalDays: val(form, "intervalDays") ? Number(val(form, "intervalDays")) : 90
    };
    const idx = data.devices.findIndex((d) => d.id === rec.id);
    if (idx >= 0) data.devices[idx] = rec;
    else data.devices.push(rec);
    save(data);
    form.hidden = true;
    render();
  });

  $("#log-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = load();
    const rec = {
      id: val(form, "id") || uid(),
      deviceId: val(form, "deviceId"),
      date: val(form, "date") || todayISO(),
      hauler: val(form, "hauler"),
      phone: val(form, "phone"),
      gallons: val(form, "gallons"),
      manifestNo: val(form, "manifestNo"),
      greasePct: val(form, "greasePct"),
      solidsPct: val(form, "solidsPct"),
      disposal: val(form, "disposal"),
      cost: val(form, "cost"),
      notes: val(form, "notes")
    };
    const idx = data.logs.findIndex((l) => l.id === rec.id);
    if (idx >= 0) data.logs[idx] = rec;
    else data.logs.push(rec);
    const dev = data.devices.find((d) => d.id === rec.deviceId);
    if (dev && rec.date && (!dev.lastPumped || rec.date >= dev.lastPumped)) {
      dev.lastPumped = rec.date;
    }
    save(data);
    form.hidden = true;
    render();
  });

  $("#device-list").addEventListener("click", (e) => {
    const editD = e.target.closest("[data-edit-device]");
    const delD = e.target.closest("[data-del-device]");
    const addL = e.target.closest("[data-add-log]");
    const editL = e.target.closest("[data-edit-log]");
    const delL = e.target.closest("[data-del-log]");
    const ics = e.target.closest("[data-ics]");
    const data = load();
    if (editD) {
      fillDeviceForm(data.devices.find((d) => d.id === editD.getAttribute("data-edit-device")));
    } else if (delD) {
      const id = delD.getAttribute("data-del-device");
      if (confirm("Remove this device and keep its log entries? You can also delete log entries one at a time.")) {
        data.devices = data.devices.filter((d) => d.id !== id);
        save(data);
        render();
      }
    } else if (addL) {
      fillLogForm(addL.getAttribute("data-add-log"), null);
    } else if (editL) {
      const log = data.logs.find((l) => l.id === editL.getAttribute("data-edit-log"));
      if (log) fillLogForm(log.deviceId, log);
    } else if (delL) {
      if (confirm("Delete this pump-out record?")) {
        data.logs = data.logs.filter((l) => l.id !== delL.getAttribute("data-del-log"));
        save(data);
        render();
      }
    } else if (ics) {
      const dev = data.devices.find((d) => d.id === ics.getAttribute("data-ics"));
      if (!dev || !dev.lastPumped || !dev.intervalDays) return;
      const due = addDays(dev.lastPumped, dev.intervalDays);
      const stamp = due.replace(/-/g, "");
      const title = "Grease trap / interceptor pump-out due" + (dev.name ? " — " + dev.name : "");
      const desc = "Reminder from FOG File (saved only on this browser). Verify current certified-hauler requirements with your city or utility before hiring.";
      const icsText = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FOG File//Pump-out reminder//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        "DTSTAMP:" + todayISO().replace(/-/g, "") + "T120000",
        "UID:" + dev.id + "@fogfile",
        "DTSTART;VALUE=DATE:" + stamp,
        "DTEND;VALUE=DATE:" + stamp,
        "SUMMARY:" + title.replace(/\n/g, " "),
        "DESCRIPTION:" + desc,
        "END:VEVENT",
        "END:VCALENDAR"
      ].join("\r\n");
      download((dev.name || "pump-out") + "-due.ics", icsText, "text/calendar");
    }
  });

  $("#export-csv").addEventListener("click", () => {
    const data = load();
    const devMap = Object.fromEntries(data.devices.map((d) => [d.id, d]));
    const headers = [
      "date",
      "business",
      "device",
      "device_type",
      "address",
      "city",
      "hauler",
      "hauler_phone",
      "gallons",
      "manifest_number",
      "grease_percent",
      "solids_percent",
      "disposal_facility",
      "cost",
      "notes",
      "last_pumped",
      "interval_days"
    ];
    const rows = [headers.join(",")];
    const logs = data.logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!logs.length) {
      rows.push(headers.map(() => "").join(","));
    }
    logs.forEach((l) => {
      const d = devMap[l.deviceId] || {};
      rows.push(
        [
          l.date,
          d.business,
          d.name,
          d.kind,
          d.address,
          d.city,
          l.hauler,
          l.phone,
          l.gallons,
          l.manifestNo,
          l.greasePct,
          l.solidsPct,
          l.disposal,
          l.cost,
          l.notes,
          d.lastPumped,
          d.intervalDays
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    download("fog-file-manifest-log-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  });

  $("#print-log").addEventListener("click", () => window.print());

  $("#clear-all").addEventListener("click", () => {
    if (confirm("Delete all devices and pump-out records saved in this browser? This cannot be undone.")) {
      localStorage.removeItem(KEY);
      $("#device-form").hidden = true;
      $("#log-form").hidden = true;
      render();
    }
  });

  render();
})();
