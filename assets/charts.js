/*
 * Tiny dependency-free SVG charts for the demo dashboards: a line/area chart
 * with a crosshair, a column chart, and horizontal bars — each with a hover
 * tooltip. Single series only, drawn in --series-1, on recessive axes.
 */
(function () {
  "use strict";

  var SVG = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceMax(value) {
    if (value <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(value)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * mag >= value) return steps[i] * mag;
    }
    return 10 * mag;
  }

  function tooltip(container) {
    var tip = container.querySelector(".chart-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      tip.hidden = true;
      container.appendChild(tip);
    }
    return {
      show: function (x, y, label, value) {
        tip.textContent = "";
        var l = document.createElement("div");
        l.className = "chart-tip-label";
        l.textContent = label;
        var v = document.createElement("div");
        v.className = "chart-tip-value";
        v.textContent = value;
        tip.appendChild(l);
        tip.appendChild(v);
        tip.hidden = false;
        var w = container.clientWidth;
        var left = Math.min(Math.max(x - tip.offsetWidth / 2, 0), w - tip.offsetWidth);
        tip.style.left = left + "px";
        tip.style.top = Math.max(y - tip.offsetHeight - 10, 0) + "px";
      },
      hide: function () {
        tip.hidden = true;
      },
    };
  }

  function frame(container, height) {
    container.classList.add("chart");
    var old = container.querySelector("svg");
    if (old) old.remove();
    var width = Math.max(container.clientWidth, 280);
    var svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      width: width,
      height: height,
      role: "img",
    });
    container.insertBefore(svg, container.firstChild);
    return { svg: svg, width: width, height: height };
  }

  function yAxis(svg, pad, width, innerH, max, format) {
    for (var i = 0; i <= 4; i++) {
      var v = (max / 4) * i;
      var y = pad.top + innerH - (v / max) * innerH;
      svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, class: i ? "gridline" : "baseline" }, svg);
      var t = svgEl("text", { x: pad.left - 8, y: y + 4, class: "tick", "text-anchor": "end" }, svg);
      t.textContent = format(v);
    }
  }

  /** Line + soft area. data: [{label, value}] */
  function line(container, data, opts) {
    opts = opts || {};
    var format = opts.format || String;
    var f = frame(container, opts.height || 240);
    var pad = { top: 12, right: 24, bottom: 28, left: 48 };
    var innerW = f.width - pad.left - pad.right;
    var innerH = f.height - pad.top - pad.bottom;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })));
    f.svg.setAttribute("aria-label", opts.label || "Line chart");

    yAxis(f.svg, pad, f.width, innerH, max, format);

    function x(i) {
      return pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    }
    function y(v) {
      return pad.top + innerH - (v / max) * innerH;
    }

    var every = Math.ceil(data.length / 6);
    data.forEach(function (d, i) {
      if (i % every !== 0 && i !== data.length - 1) return;
      var t = svgEl("text", { x: x(i), y: f.height - 8, class: "tick", "text-anchor": "middle" }, f.svg);
      t.textContent = d.label;
    });

    var pts = data.map(function (d, i) { return x(i) + "," + y(d.value); });
    svgEl("polygon", {
      points: pad.left + "," + (pad.top + innerH) + " " + pts.join(" ") + " " + x(data.length - 1) + "," + (pad.top + innerH),
      class: "area",
    }, f.svg);
    svgEl("polyline", { points: pts.join(" "), class: "line" }, f.svg);

    var cross = svgEl("line", { y1: pad.top, y2: pad.top + innerH, class: "crosshair", visibility: "hidden" }, f.svg);
    var dot = svgEl("circle", { r: 5, class: "dot-marker", visibility: "hidden" }, f.svg);
    var tip = tooltip(container);
    var hit = svgEl("rect", { x: pad.left, y: pad.top, width: innerW, height: innerH, fill: "transparent" }, f.svg);

    function move(event) {
      var rect = f.svg.getBoundingClientRect();
      var px = ((event.clientX - rect.left) / rect.width) * f.width;
      var i = Math.round(((px - pad.left) / innerW) * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      var cx = x(i);
      var cy = y(data[i].value);
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", cy);
      dot.setAttribute("visibility", "visible");
      tip.show((cx / f.width) * rect.width, (cy / f.height) * rect.height, data[i].label, format(data[i].value));
    }
    function leave() {
      cross.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      tip.hide();
    }
    hit.addEventListener("mousemove", move);
    hit.addEventListener("mouseleave", leave);
  }

  /** Vertical columns with rounded, baseline-anchored tops. */
  function columns(container, data, opts) {
    opts = opts || {};
    var format = opts.format || String;
    var f = frame(container, opts.height || 240);
    var pad = { top: 12, right: 12, bottom: 28, left: 40 };
    var innerW = f.width - pad.left - pad.right;
    var innerH = f.height - pad.top - pad.bottom;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })));
    f.svg.setAttribute("aria-label", opts.label || "Column chart");
    yAxis(f.svg, pad, f.width, innerH, max, format);

    var slot = innerW / data.length;
    var barW = Math.max(Math.min(slot - 2, 28), 4);
    var tip = tooltip(container);
    var every = Math.ceil(data.length / 7);

    data.forEach(function (d, i) {
      var cx = pad.left + slot * i + slot / 2;
      var h = (d.value / max) * innerH;
      var top = pad.top + innerH - h;
      var r = Math.min(4, barW / 2, h);
      // Rounded top corners, square at the baseline.
      var path =
        "M" + (cx - barW / 2) + "," + (pad.top + innerH) +
        "V" + (top + r) +
        "Q" + (cx - barW / 2) + "," + top + " " + (cx - barW / 2 + r) + "," + top +
        "H" + (cx + barW / 2 - r) +
        "Q" + (cx + barW / 2) + "," + top + " " + (cx + barW / 2) + "," + (top + r) +
        "V" + (pad.top + innerH) + "Z";
      var bar = svgEl("path", { d: path, class: "bar" }, f.svg);
      var hit = svgEl("rect", { x: pad.left + slot * i, y: pad.top, width: slot, height: innerH, fill: "transparent" }, f.svg);
      hit.addEventListener("mouseenter", function () {
        bar.classList.add("active");
        var rect = f.svg.getBoundingClientRect();
        tip.show((cx / f.width) * rect.width, (top / f.height) * rect.height, d.label, format(d.value));
      });
      hit.addEventListener("mouseleave", function () {
        bar.classList.remove("active");
        tip.hide();
      });
      if (i % every === 0) {
        var t = svgEl("text", { x: cx, y: f.height - 8, class: "tick", "text-anchor": "middle" }, f.svg);
        t.textContent = d.label;
      }
    });
  }

  /** Horizontal bars, label on the left and value on the right. */
  function bars(container, data, opts) {
    opts = opts || {};
    var format = opts.format || String;
    container.classList.add("hbars");
    container.textContent = "";
    var max = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    var tip = tooltip(container);
    data.forEach(function (d) {
      var row = document.createElement("div");
      row.className = "hbar-row";
      var label = document.createElement("span");
      label.className = "hbar-label";
      label.textContent = d.label;
      var track = document.createElement("span");
      track.className = "hbar-track";
      var fill = document.createElement("span");
      fill.className = "hbar-fill";
      fill.style.width = Math.max((d.value / max) * 100, 1) + "%";
      track.appendChild(fill);
      var value = document.createElement("span");
      value.className = "hbar-value";
      value.textContent = format(d.value);
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      row.addEventListener("mouseenter", function () {
        var box = container.getBoundingClientRect();
        var f = fill.getBoundingClientRect();
        tip.show(f.right - box.left, f.top - box.top, d.label, d.detail || format(d.value));
      });
      row.addEventListener("mouseleave", tip.hide);
      container.appendChild(row);
    });
  }

  /** Deterministic pseudo-random numbers, so the dummy data is stable per load. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lastDays(n) {
    var out = [];
    var today = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(d);
    }
    return out;
  }

  function shortDate(d) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function compact(n) {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  window.Charts = {
    line: line,
    columns: columns,
    bars: bars,
    seeded: seeded,
    lastDays: lastDays,
    shortDate: shortDate,
    compact: compact,
  };
})();
