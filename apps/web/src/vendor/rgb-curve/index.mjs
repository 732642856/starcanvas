import { jsx as W, jsxs as J } from "react/jsx-runtime";
import { useState as N, useRef as K, useCallback as M, useEffect as z, memo as Q, useMemo as O, forwardRef as oe, useImperativeHandle as te } from "react";
function H(n, o, e) {
  return Math.min(Math.max(n, o), e);
}
function _() {
  return [
    { x: 0, y: 0 },
    { x: 255, y: 255 }
  ];
}
function U() {
  return {
    master: _(),
    red: _(),
    green: _(),
    blue: _()
  };
}
function S(n) {
  return [...n].sort((o, e) => o.x - e.x);
}
function V(n, o) {
  const e = S(n), r = e.length;
  if (r === 0) return o;
  if (r === 1 || o <= e[0].x) return e[0].y;
  if (o >= e[r - 1].x) return e[r - 1].y;
  let t = 0;
  for (; t < r - 1 && e[t + 1].x < o; )
    t++;
  const g = e[t].x, d = e[t + 1].x, v = e[t].y, i = e[t + 1].y, s = d - g, a = i - v;
  if (s === 0) return v;
  let b, f;
  if (t === 0)
    b = a / s;
  else {
    const y = g - e[t - 1].x, p = v - e[t - 1].y;
    b = y === 0 ? 0 : (a / s + p / y) / 2;
  }
  if (t === r - 2)
    f = a / s;
  else {
    const y = e[t + 2].x - d, p = e[t + 2].y - i;
    f = y === 0 ? 0 : (a / s + p / y) / 2;
  }
  const h = a / s;
  if (h === 0)
    b = 0, f = 0;
  else {
    const y = b / h, p = f / h;
    y < 0 && (b = 0), p < 0 && (f = 0);
    const c = y * y + p * p;
    if (c > 9) {
      const P = 3 / Math.sqrt(c);
      b = P * y * h, f = P * p * h;
    }
  }
  const C = (o - g) / s, m = C * C, k = m * C, I = 2 * k - 3 * m + 1, l = k - 2 * m + C, u = -2 * k + 3 * m, w = k - m, T = I * v + l * s * b + u * i + w * s * f;
  return H(Math.round(T), 0, 255);
}
function Z(n, o) {
  const e = S(n), r = e.length;
  if (r === 0) return o;
  if (r === 1 || o <= e[0].x) return e[0].y;
  if (o >= e[r - 1].x) return e[r - 1].y;
  let t = 0;
  for (; t < r - 1 && e[t + 1].x < o; )
    t++;
  const g = e[Math.max(0, t - 1)], d = e[t], v = e[Math.min(r - 1, t + 1)], i = e[Math.min(r - 1, t + 2)], s = v.x - d.x;
  if (s === 0) return d.y;
  const a = (o - d.x) / s, b = a * a, f = b * a, h = 0.5 * (2 * d.y + (-g.y + v.y) * a + (2 * g.y - 5 * d.y + 4 * v.y - i.y) * b + (-g.y + 3 * d.y - 3 * v.y + i.y) * f);
  return H(Math.round(h), 0, 255);
}
function G(n, o = "monotone") {
  const e = new Uint8Array(256), r = o === "monotone" ? V : Z;
  for (let t = 0; t < 256; t++)
    e[t] = r(n, t);
  return e;
}
function q(n, o = "monotone") {
  return {
    master: G(n.master, o),
    red: G(n.red, o),
    green: G(n.green, o),
    blue: G(n.blue, o)
  };
}
function Ce(n, o, e, r) {
  let t = r.red[H(n, 0, 255)], g = r.green[H(o, 0, 255)], d = r.blue[H(e, 0, 255)];
  return t = r.master[t], g = r.master[g], d = r.master[d], [t, g, d];
}
function re(n, o, e) {
  const r = n.x - o.x, t = n.y - o.y;
  return Math.sqrt(r * r + t * t) <= e;
}
const se = ["master", "red", "green", "blue"], ae = {
  master: { label: "Master", shortLabel: "RGB" },
  red: { label: "Red", shortLabel: "R" },
  green: { label: "Green", shortLabel: "G" },
  blue: { label: "Blue", shortLabel: "B" }
}, ie = 300, le = 300, R = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
    backgroundColor: "#1a1a1a",
    borderRadius: "12px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  canvasWrapper: {
    position: "relative",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#0d0d0d"
  },
  grid: {
    color: "#2a2a2a",
    lineWidth: 1,
    subdivisions: 4,
    showDiagonal: !0,
    diagonalColor: "#333333"
  },
  curve: {
    master: {
      color: "#e0e0e0",
      width: 2,
      shadowColor: "rgba(255, 255, 255, 0.3)",
      shadowBlur: 4
    },
    red: {
      color: "#ff6b6b",
      width: 2,
      shadowColor: "rgba(255, 107, 107, 0.4)",
      shadowBlur: 4
    },
    green: {
      color: "#51cf66",
      width: 2,
      shadowColor: "rgba(81, 207, 102, 0.4)",
      shadowBlur: 4
    },
    blue: {
      color: "#339af0",
      width: 2,
      shadowColor: "rgba(51, 154, 240, 0.4)",
      shadowBlur: 4
    }
  },
  controlPoint: {
    radius: 6,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 2,
    activeFill: "#ffd43b",
    activeStroke: "#000000",
    hoverScale: 1.2
  },
  tabs: {
    background: "#252525",
    borderRadius: 8,
    gap: 4,
    tab: {
      padding: "8px 16px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      color: "#808080",
      background: "transparent",
      hoverBackground: "#333333",
      activeColor: "#ffffff",
      activeBackground: "#404040"
    }
  },
  histogram: {
    show: !1,
    opacity: 0.3,
    fillColor: "#666666"
  }
}, ce = {
  master: "#e0e0e0",
  red: "#ff6b6b",
  green: "#51cf66",
  blue: "#339af0"
}, ue = 12, Y = 5;
function de(n) {
  const {
    points: o,
    channel: e,
    width: r,
    height: t,
    disabled: g = !1,
    onAddPoint: d,
    onRemovePoint: v,
    onUpdatePoint: i
  } = n, [s, a] = N(null), [b, f] = N(
    null
  ), h = K(!1), C = M(
    (p, c) => ({
      x: Math.round(p / r * 255),
      y: Math.round((1 - c / t) * 255)
      // Flip Y axis
    }),
    [r, t]
  ), m = M(
    (p, c) => ({
      x: p / 255 * r,
      y: (1 - c / 255) * t
      // Flip Y axis
    }),
    [r, t]
  ), k = M(
    (p, c) => {
      const P = S(o);
      for (let x = 0; x < P.length; x++) {
        const L = m(P[x].x, P[x].y);
        if (re(
          { x: p, y: c },
          L,
          ue
        ))
          return x;
      }
      return null;
    },
    [o, m]
  ), I = M(
    (p) => {
      const c = p.currentTarget.getBoundingClientRect();
      return {
        x: p.clientX - c.left,
        y: p.clientY - c.top
      };
    },
    []
  ), l = M(
    (p) => {
      if (g) return;
      const c = I(p), P = k(c.x, c.y);
      if (P !== null)
        a(P), h.current = !0;
      else {
        const x = C(c.x, c.y);
        d(e, x);
      }
    },
    [
      g,
      I,
      k,
      C,
      e,
      d
    ]
  ), u = M(
    (p) => {
      if (g) return;
      const c = I(p);
      if (h.current && s !== null) {
        const P = C(c.x, c.y);
        i(e, s, P);
      } else {
        const P = k(c.x, c.y);
        f(P);
      }
    },
    [
      g,
      I,
      s,
      C,
      e,
      i,
      k
    ]
  ), w = M(() => {
    h.current = !1, a(null);
  }, []), T = M(() => {
    h.current = !1, a(null), f(null);
  }, []), y = M(
    (p) => {
      if (g) return;
      const c = I(p), P = k(c.x, c.y);
      P !== null && v(e, P);
    },
    [g, I, k, e, v]
  );
  return z(() => {
    const p = () => {
      h.current = !1, a(null);
    };
    return window.addEventListener("mouseup", p), () => {
      window.removeEventListener("mouseup", p);
    };
  }, []), {
    activePointIndex: s,
    hoveredPointIndex: b,
    handleMouseDown: l,
    handleMouseMove: u,
    handleMouseUp: w,
    handleMouseLeave: T,
    handleDoubleClick: y
  };
}
const fe = Q(function({
  width: o,
  height: e,
  points: r,
  channel: t,
  gridStyle: g = R.grid,
  curveStyle: d,
  controlPointStyle: v = R.controlPoint,
  histogramStyle: i = R.histogram,
  histogramData: s,
  wrapperStyle: a = R.canvasWrapper,
  disabled: b = !1,
  interpolation: f = "monotone",
  onAddPoint: h,
  onRemovePoint: C,
  onUpdatePoint: m
}) {
  const k = K(null), {
    activePointIndex: I,
    hoveredPointIndex: l,
    handleMouseDown: u,
    handleMouseMove: w,
    handleMouseUp: T,
    handleMouseLeave: y,
    handleDoubleClick: p
  } = de({
    points: r,
    channel: t,
    width: o,
    height: e,
    disabled: b,
    onAddPoint: h,
    onRemovePoint: C,
    onUpdatePoint: m
  }), c = typeof window < "u" && window.devicePixelRatio || 1, P = M(() => {
    const x = k.current;
    if (!x) return;
    const L = x.getContext("2d");
    if (!L) return;
    L.clearRect(0, 0, o * c, e * c), L.save(), L.scale(c, c), i != null && i.show && s && be(L, s, i, o, e), ve(L, g, o, e), pe(L, r, d, o, e, f === "monotone" ? V : Z), ge(
      L,
      r,
      v,
      o,
      e,
      I,
      l
    ), L.restore();
  }, [
    o,
    e,
    c,
    r,
    g,
    d,
    v,
    i,
    s,
    f,
    I,
    l
  ]);
  return z(() => {
    P();
  }, [P]), z(() => {
    const x = k.current;
    x && (x.width = o * c, x.height = e * c, x.style.width = `${o}px`, x.style.height = `${e}px`, P());
  }, [o, e, c, P]), /* @__PURE__ */ W("div", { style: a, children: /* @__PURE__ */ W(
    "canvas",
    {
      ref: k,
      style: {
        display: "block",
        cursor: b ? "not-allowed" : l !== null ? "grab" : "crosshair"
      },
      onMouseDown: u,
      onMouseMove: w,
      onMouseUp: T,
      onMouseLeave: y,
      onDoubleClick: p
    }
  ) });
});
function ve(n, o, e, r) {
  const { color: t, lineWidth: g, subdivisions: d, showDiagonal: v, diagonalColor: i } = {
    ...R.grid,
    ...o
  };
  n.strokeStyle = t, n.lineWidth = g;
  const s = e / d;
  for (let a = 1; a < d; a++) {
    const b = a * s;
    n.beginPath(), n.moveTo(b, 0), n.lineTo(b, r), n.stroke(), n.beginPath(), n.moveTo(0, b), n.lineTo(e, b), n.stroke();
  }
  n.strokeRect(0.5, 0.5, e - 1, r - 1), v && (n.strokeStyle = i, n.setLineDash([4, 4]), n.beginPath(), n.moveTo(0, r), n.lineTo(e, 0), n.stroke(), n.setLineDash([]));
}
function be(n, o, e, r, t) {
  const { opacity: g, fillColor: d } = { ...R.histogram, ...e };
  let v = 0;
  for (let s = 0; s < o.length; s++)
    o[s] > v && (v = o[s]);
  if (v === 0) return;
  n.fillStyle = d, n.globalAlpha = g;
  const i = r / 256;
  for (let s = 0; s < 256; s++) {
    const a = o[s] / v * t, b = s * i;
    n.fillRect(b, t - a, i, a);
  }
  n.globalAlpha = 1;
}
function pe(n, o, e, r, t, g) {
  const d = S(o);
  if (d.length === 0) return;
  const { color: v, width: i, shadowColor: s, shadowBlur: a } = {
    ...R.curve.master,
    ...e
  };
  s && a && (n.shadowColor = s, n.shadowBlur = a), n.strokeStyle = v, n.lineWidth = i, n.lineCap = "round", n.lineJoin = "round", n.beginPath();
  for (let b = 0; b <= r; b++) {
    const f = b / r * 255, h = g(d, f), C = t - h / 255 * t;
    b === 0 ? n.moveTo(b, C) : n.lineTo(b, C);
  }
  n.stroke(), n.shadowColor = "transparent", n.shadowBlur = 0;
}
function ge(n, o, e, r, t, g, d) {
  const v = S(o), {
    radius: i,
    fill: s,
    stroke: a,
    strokeWidth: b,
    activeFill: f,
    activeStroke: h,
    hoverScale: C
  } = {
    ...R.controlPoint,
    ...e
  };
  v.forEach((m, k) => {
    const I = m.x / 255 * r, l = t - m.y / 255 * t, u = k === g, y = i * (k === d || u ? C : 1);
    n.beginPath(), n.arc(I, l, y, 0, Math.PI * 2), n.fillStyle = u ? f : s, n.fill(), n.strokeStyle = u ? h : a, n.lineWidth = b, n.stroke();
  });
}
const he = Q(function({
  activeChannel: o,
  onChange: e,
  style: r,
  disabled: t = !1
}) {
  const [g, d] = N(null), v = {
    ...R.tabs,
    ...r,
    tab: {
      ...R.tabs.tab,
      ...r == null ? void 0 : r.tab
    }
  }, i = {
    display: "flex",
    alignItems: "center",
    gap: v.gap,
    padding: "4px",
    backgroundColor: v.background,
    borderRadius: v.borderRadius
  }, s = M(
    (f) => {
      const h = f === o, C = f === g, m = v.tab;
      return {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: m.padding,
        borderRadius: m.borderRadius,
        fontSize: m.fontSize,
        fontWeight: m.fontWeight,
        color: h ? m.activeColor : m.color,
        backgroundColor: h ? m.activeBackground : C ? m.hoverBackground : m.background,
        border: "none",
        cursor: t ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        opacity: t ? 0.5 : 1,
        outline: "none"
      };
    },
    [o, g, v.tab, t]
  ), a = (f) => {
    const h = ce[f];
    return {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: h,
      boxShadow: f === o ? `0 0 6px ${h}` : "none",
      transition: "box-shadow 0.15s ease"
    };
  }, b = M(
    (f) => {
      t || e(f);
    },
    [t, e]
  );
  return /* @__PURE__ */ W("div", { style: i, role: "tablist", children: se.map((f) => /* @__PURE__ */ J(
    "button",
    {
      role: "tab",
      "aria-selected": f === o,
      "aria-disabled": t,
      style: s(f),
      onClick: () => b(f),
      onMouseEnter: () => d(f),
      onMouseLeave: () => d(null),
      children: [
        /* @__PURE__ */ W("span", { style: a(f) }),
        /* @__PURE__ */ W("span", { children: ae[f].label })
      ]
    },
    f
  )) });
});
function me(n = {}) {
  const {
    defaultPoints: o,
    controlledPoints: e,
    interpolation: r = "monotone",
    onChange: t
  } = n, g = O(() => {
    const l = U();
    return o ? {
      master: o.master || l.master,
      red: o.red || l.red,
      green: o.green || l.green,
      blue: o.blue || l.blue
    } : l;
  }, [o]), [d, v] = N(g), i = O(() => {
    if (e) {
      const l = U();
      return {
        master: e.master || l.master,
        red: e.red || l.red,
        green: e.green || l.green,
        blue: e.blue || l.blue
      };
    }
    return d;
  }, [e, d]), s = O(() => q(i, r), [i, r]), a = M(
    (l) => {
      if (e || v(l), t) {
        const u = q(l, r);
        t(l, u);
      }
    },
    [e, t, r]
  ), b = M(
    (l, u) => {
      const w = i[l], T = S(w);
      for (const c of T)
        if (Math.abs(c.x - u.x) < Y)
          return;
      const y = S([...w, u]), p = {
        ...i,
        [l]: y
      };
      a(p);
    },
    [i, a]
  ), f = M(
    (l, u) => {
      const w = i[l];
      if (w.length <= 2) return;
      const T = S(w);
      if (u === 0 || u === T.length - 1) return;
      const y = T.filter((c, P) => P !== u), p = {
        ...i,
        [l]: y
      };
      a(p);
    },
    [i, a]
  ), h = M(
    (l, u, w) => {
      const T = S(i[l]), y = u === 0, p = u === T.length - 1;
      let c = w.x;
      if (y)
        c = 0;
      else if (p)
        c = 255;
      else {
        const A = T[u - 1].x + Y, E = T[u + 1].x - Y;
        c = H(c, A, E);
      }
      const P = H(w.y, 0, 255), x = T.map(
        (A, E) => E === u ? { x: c, y: P } : A
      ), L = {
        ...i,
        [l]: x
      };
      a(L);
    },
    [i, a]
  ), C = M(
    (l) => {
      const u = U(), w = {
        ...i,
        [l]: u[l]
      };
      a(w);
    },
    [i, a]
  ), m = M(() => {
    const l = U();
    a(l);
  }, [a]), k = M(
    (l, u) => {
      const w = {
        ...i,
        [l]: S(u)
      };
      a(w);
    },
    [i, a]
  ), I = M(
    (l) => {
      const u = U(), w = {
        master: S(l.master || u.master),
        red: S(l.red || u.red),
        green: S(l.green || u.green),
        blue: S(l.blue || u.blue)
      };
      a(w);
    },
    [a]
  );
  return {
    points: i,
    lut: s,
    addPoint: b,
    removePoint: f,
    updatePoint: h,
    resetChannel: C,
    resetAll: m,
    setChannelPoints: k,
    setAllPoints: I
  };
}
const we = oe(
  function({
    width: o = ie,
    height: e = le,
    defaultPoints: r,
    points: t,
    defaultChannel: g = "master",
    activeChannel: d,
    onChange: v,
    onChannelChange: i,
    styles: s = {},
    showTabs: a = !0,
    showHistogram: b = !1,
    histogramData: f,
    disabled: h = !1,
    className: C,
    interpolation: m = "monotone"
  }, k) {
    const [I, l] = N(g), u = d ?? I, w = M(
      (B, F) => {
        v && v({
          points: B,
          lut: F,
          activeChannel: u
        });
      },
      [v, u]
    ), {
      points: T,
      lut: y,
      addPoint: p,
      removePoint: c,
      updatePoint: P,
      resetChannel: x,
      resetAll: L,
      setAllPoints: A
    } = me({
      defaultPoints: r,
      controlledPoints: t,
      interpolation: m,
      onChange: w
    }), E = M(
      (B) => {
        d || l(B), i && i(B);
      },
      [d, i]
    );
    te(
      k,
      () => ({
        reset: L,
        resetChannel: x,
        getLUT: () => y,
        getPoints: () => T,
        setPoints: A
      }),
      [L, x, y, T, A]
    );
    const D = O(() => {
      var B, F, X, $, j;
      return {
        container: { ...R.container, ...s.container },
        canvasWrapper: {
          ...R.canvasWrapper,
          ...s.canvasWrapper
        },
        grid: { ...R.grid, ...s.grid },
        curve: {
          master: { ...R.curve.master, ...(B = s.curve) == null ? void 0 : B.master },
          red: { ...R.curve.red, ...(F = s.curve) == null ? void 0 : F.red },
          green: { ...R.curve.green, ...(X = s.curve) == null ? void 0 : X.green },
          blue: { ...R.curve.blue, ...($ = s.curve) == null ? void 0 : $.blue }
        },
        controlPoint: {
          ...R.controlPoint,
          ...s.controlPoint
        },
        tabs: {
          ...R.tabs,
          ...s.tabs,
          tab: { ...R.tabs.tab, ...(j = s.tabs) == null ? void 0 : j.tab }
        },
        histogram: { ...R.histogram, ...s.histogram }
      };
    }, [s]), ee = D.curve[u], ne = {
      ...D.container,
      width: "fit-content"
    };
    return /* @__PURE__ */ J("div", { style: ne, className: C, children: [
      a && /* @__PURE__ */ W(
        he,
        {
          activeChannel: u,
          onChange: E,
          style: D.tabs,
          disabled: h
        }
      ),
      /* @__PURE__ */ W(
        fe,
        {
          width: o,
          height: e,
          points: T[u],
          channel: u,
          gridStyle: D.grid,
          curveStyle: ee,
          controlPointStyle: D.controlPoint,
          histogramStyle: {
            ...D.histogram,
            show: b
          },
          histogramData: f,
          wrapperStyle: D.canvasWrapper,
          disabled: h,
          interpolation: m,
          onAddPoint: p,
          onRemovePoint: c,
          onUpdatePoint: P
        }
      )
    ] });
  }
);
export {
  se as CHANNELS,
  ce as CHANNEL_COLORS,
  ae as CHANNEL_INFO,
  he as ChannelTabs,
  fe as CurveCanvas,
  le as DEFAULT_HEIGHT,
  R as DEFAULT_STYLES,
  ie as DEFAULT_WIDTH,
  we as RGBCurve,
  Ce as applyLUT,
  Z as catmullRomInterpolation,
  H as clamp,
  G as generateChannelLUT,
  q as generateLUT,
  U as getDefaultChannelPoints,
  _ as getDefaultPoints,
  V as monotoneCubicInterpolation,
  S as sortPoints,
  de as useCanvasInteraction,
  me as useCurvePoints
};
//# sourceMappingURL=index.mjs.map
