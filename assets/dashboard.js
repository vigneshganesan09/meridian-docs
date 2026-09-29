/*
 * Meridian Docs — the dashboard's sample data. Nothing here is real; it is
 * generated from a fixed seed so every load of a given range looks the same.
 */
(function () {
  "use strict";

  var C = window.Charts;
  var el = window.AppShell.el;

  var SPACES = ["Engineering", "Product", "Customer Success", "Security", "People Ops", "Finance"];
  var PEOPLE = ["Ana Costa", "Ben Okafor", "Chen Wei", "Dana Ruiz", "Eli Novak", "Farah Aziz"];
  var DOCS = [
    ["Q4 platform roadmap", 1],
    ["Incident review: SSO latency", 0],
    ["Onboarding checklist", 4],
    ["SOC 2 evidence tracker", 3],
    ["API versioning RFC", 0],
    ["Renewal playbook", 2],
    ["FY27 budget assumptions", 5],
  ];
  var ACTIONS = ["commented on", "edited", "shared", "approved", "created"];

  function tile(label, value, sub, meterPct) {
    var node = document.createElement("div");
    node.className = "card kpi";
    var l = document.createElement("div");
    l.className = "kpi-label";
    l.textContent = label;
    var v = document.createElement("div");
    v.className = "kpi-value";
    v.textContent = value;
    node.appendChild(l);
    node.appendChild(v);
    if (typeof meterPct === "number") {
      var meter = document.createElement("div");
      meter.className = "kpi-meter";
      meter.setAttribute("role", "meter");
      meter.setAttribute("aria-valuenow", String(Math.round(meterPct)));
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      var fill = document.createElement("span");
      fill.style.width = meterPct + "%";
      meter.appendChild(fill);
      node.appendChild(meter);
    }
    var s = document.createElement("div");
    s.className = "kpi-delta muted";
    s.textContent = sub;
    node.appendChild(s);
    return node;
  }

  function ago(minutes) {
    if (minutes < 60) return minutes + "m ago";
    if (minutes < 60 * 24) return Math.round(minutes / 60) + "h ago";
    return Math.round(minutes / 1440) + "d ago";
  }

  function initials(name) {
    return name.split(" ").map(function (p) { return p[0]; }).join("");
  }

  function render(range) {
    window.Dashboard.range = range;
    var rand = C.seeded(2000 + range);
    var days = C.lastDays(range);

    var edits = days.map(function (d) {
      var weekday = d.getDay() === 0 || d.getDay() === 6 ? 0.25 : 1;
      return { label: C.shortDate(d), value: Math.round(140 * weekday * (0.7 + rand() * 0.6)) };
    });
    var totalEdits = edits.reduce(function (s, d) { return s + d.value; }, 0);

    var kpis = el("kpis");
    kpis.textContent = "";
    kpis.appendChild(tile("Documents", "1,284", "+" + Math.round(range * 1.6) + " in the last " + range + " days"));
    kpis.appendChild(tile("Edits", C.compact(totalEdits), "across 6 spaces"));
    kpis.appendChild(tile("Shared with you", String(18 + Math.round(rand() * 12)), "4 awaiting your review"));
    kpis.appendChild(tile("Storage used", "37.4 GB", "of 50 GB on your plan", 74.8));

    C.columns(el("chart-edits"), edits, {
      label: "Document edits per day over the last " + range + " days",
      format: function (v) { return String(Math.round(v)); },
    });

    C.bars(
      el("chart-spaces"),
      SPACES.map(function (name, i) {
        var value = Math.round((420 / (i + 1.3)) * (0.85 + rand() * 0.3));
        return { label: name, value: value, detail: value + " documents" };
      }),
    );

    var tbody = el("recent-docs");
    tbody.textContent = "";
    DOCS.forEach(function (doc, i) {
      var tr = document.createElement("tr");
      var title = document.createElement("td");
      title.textContent = doc[0];
      var space = document.createElement("td");
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = SPACES[doc[1]];
      space.appendChild(tag);
      var owner = document.createElement("td");
      owner.textContent = PEOPLE[(i * 5) % PEOPLE.length];
      var updated = document.createElement("td");
      updated.className = "num muted";
      updated.textContent = ago(Math.round(12 + i * i * 55 + rand() * 40));
      [title, space, owner, updated].forEach(function (td) { tr.appendChild(td); });
      tbody.appendChild(tr);
    });

    var feed = el("activity");
    feed.textContent = "";
    for (var i = 0; i < 5; i++) {
      var person = PEOPLE[Math.floor(rand() * PEOPLE.length)];
      var li = document.createElement("li");
      var avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.textContent = initials(person);
      var text = document.createElement("div");
      var who = document.createElement("strong");
      who.textContent = person;
      text.appendChild(who);
      text.appendChild(
        document.createTextNode(" " + ACTIONS[i % ACTIONS.length] + " “" + DOCS[(i * 3) % DOCS.length][0] + "”"),
      );
      var when = document.createElement("time");
      when.textContent = ago(Math.round(5 + i * i * 38 + rand() * 20));
      text.appendChild(when);
      li.appendChild(avatar);
      li.appendChild(text);
      feed.appendChild(li);
    }
  }

  window.Dashboard = { render: render, range: 30 };
})();
