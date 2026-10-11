/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars -- Retained generated engine syntax. */
// Specialized from WatercolorGradient.jsx; unused engines and CPU fallback omitted.
var kn = {
  wetness: 68,
  pigment: 54,
  scale: 54,
  spread: 48,
  blooms: 28,
  granulation: 32,
  edges: 40,
  texture: 26,
  paperWarmth: 22,
  coverage: 76,
  seed: 17,
  angle: 330,
  layers: 5,
  technique: "wash",
};
function vt(e) {
  let t = e !== null && typeof e == "object" && !Array.isArray(e) ? e : {},
    n = (o, s = 0, r = 100) => {
      let i = t[o];
      return typeof i == "number" && Number.isFinite(i)
        ? Math.min(r, Math.max(s, i))
        : kn[o];
    },
    a = t.technique;
  return {
    wetness: n("wetness"),
    pigment: n("pigment"),
    scale: n("scale"),
    spread: n("spread"),
    blooms: n("blooms"),
    granulation: n("granulation"),
    edges: n("edges"),
    texture: n("texture"),
    paperWarmth: n("paperWarmth"),
    coverage: n("coverage"),
    seed: Math.round(n("seed", 1, 9999)),
    angle: n("angle", 0, 360),
    layers: Math.round(n("layers", 2, 8)),
    technique: a === "wash" || a === "pools" || a === "veil" ? a : kn.technique,
  };
}
var qt = 256;
var Zt = 8;
function La(e) {
  let t = e >>> 0;
  return () => (
    (t = (Math.imul(t, 1664525) + 1013904223) >>> 0),
    t / 4294967296
  );
}
var st = new Uint8Array(qt * qt * 4);
var Or = La(1977);
function Dr(e) {
  let t = e.filter((n) => /^#[0-9a-f]{6}$/i.test(n)).slice(0, 12);
  return (t.length ? t : ["#387D99", "#8B79AD", "#DF929F", "#E4B879"]).map(
    (n) => {
      let a = parseInt(n.slice(1), 16);
      return [(a >> 16) & 255, (a >> 8) & 255, a & 255].map(
        (o) => -Math.log(Math.max(0.025, o / 255)),
      );
    },
  );
}
var Te = (e, t, n) => Math.sin(e * t + n) - Math.sin(n);
var Aa = (e) => (Number.isFinite(e) ? Math.max(0, Math.min(1e6, e)) : 0);
function ka(e) {
  return [
    0.32 * Te(e, 0.72, 0),
    0.3 * Te(e, 0.57, 1.3),
    0.28 * Te(e, 0.39, 0.7),
    0.3 * Te(e, 0.83, 2.1),
  ];
}
function Ra(e, t, n, a = 0) {
  let o = La(e.seed * 8191),
    s = Dr(t),
    i = [
      0,
      ...(n?.length === s.length - 1 &&
      n.every((u, p) => Number.isFinite(u) && u >= (n[p - 1] ?? 0) && u <= 1)
        ? n
        : s.slice(1).map((u, p) => (p + 1) / s.length)),
      1,
    ],
    c = s.map((u, p) => i[p + 1] - i[p]),
    d = s.map((u, p) => (i[p + 1] + i[p]) * 0.5),
    l = [];
  for (let u = 0; u < e.layers; u++) {
    let p = (u + 0.5) / e.layers,
      m = c.map(
        (L, w) =>
          L * Math.exp(-0.5 * ((p - d[w]) / (0.13 + 0.2 / e.layers)) ** 2),
      ),
      f = Math.max(
        1e-8,
        m.reduce((L, w) => L + w, 0),
      ),
      b = [0, 1, 2].map((L) => s.reduce((w, I, E) => w + (I[L] * m[E]) / f, 0)),
      h = u * 1.71 + e.seed * 0.007,
      g = (o() - 0.5) * 2.5 + 0.12 * Te(a, 0.47, h),
      v = (0.12 + (e.coverage / 100) * 0.26) * (0.76 + o() * 0.46);
    l.push({
      x: (p - 0.5) * 1.4 + (o() - 0.5) * 0.2 + 0.09 * Te(a, 0.67, h),
      y:
        Math.sin(p * Math.PI * 2 + e.seed * 0.7) * 0.2 +
        (o() - 0.5) * 0.28 +
        0.075 * Te(a, 0.59, h + 1.6),
      rx:
        v * (e.technique === "veil" ? 1.7 : 1.22) * (1 + 0.09 * Te(a, 0.81, h)),
      ry:
        v *
        (e.technique === "pools" ? 0.84 : 1.1) *
        (1 + 0.09 * Te(a, 0.63, h + 1.8)),
      c: Math.cos(g),
      s: Math.sin(g),
      strength: 0.68 + o() * 0.4,
      color: b,
      bloom: [
        0.36 * Math.sin(u * 2.3 + 1) + 0.12 * Te(a, 0.41, h),
        0.36 * Math.cos(u * 1.7) + 0.12 * Te(a, 0.53, h + 1.2),
        0.04 * Te(a, 0.65, h),
      ],
    });
  }
  return l;
}
var Tr = `precision highp float;
uniform vec2 u_res; uniform float u_dark;
uniform sampler2D u_noise;
uniform vec4 u_shape[8];
uniform vec4 u_pigment[8];
uniform vec2 u_turn[8];
uniform vec3 u_bloom[8];
uniform vec4 u_flow;
uniform float u_layers,u_seed,u_angle,u_scale,u_spread,u_wetness,u_pigmentStrength;
uniform float u_blooms,u_granulation,u_edges,u_texture,u_warmth,u_veil;
vec4 field(vec2 p) {
  vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return texture2D(u_noise,(mod(floor(p),256.0)+f+0.5)/256.0);
}
void main(){
  vec2 uv=vec2(gl_FragCoord.x/u_res.x,1.0-gl_FragCoord.y/u_res.y);
  float aspect=u_res.x/u_res.y;
  vec2 paper=(uv-0.5)*vec2(aspect,1.0)/max(1.0,aspect);
  float cs=cos(u_angle),sn=sin(u_angle);
  vec2 p=vec2(paper.x*cs-paper.y*sn,paper.x*sn+paper.y*cs)*u_scale;
  vec2 offset=vec2(mod(u_seed*13.71,197.0),mod(u_seed*7.93,211.0));
  vec4 large=field(p*3.7+offset+u_flow.xy);
  vec4 mid=field(p*11.8+offset+large.rg*1.7+u_flow.zw);
  vec4 fine=field(p*43.0+offset+mid.rg*0.8+u_flow.xy*0.35);
  vec2 warp=((large.rg-0.5)*0.44+(mid.rg-0.5)*0.16+(fine.rg-0.5)*0.027)*(0.25+u_spread*1.4);
  float frequency=min(620.0,min(u_res.x,u_res.y)*0.45);
  vec4 tooth=field(paper*frequency+vec2(37.0,89.0));
  vec4 fiber=field(paper*min(210.0,frequency*0.45)+vec2(71.0,13.0));
  float grain=(tooth.r-0.5)*0.68+(fiber.g-0.5)*0.32;
  float feather=0.025+u_wetness*0.31+u_veil*0.13;
  vec3 absorption=vec3(0.0);
  for(int i=0;i<8;i++){
    if(float(i)>=u_layers) break;
    vec2 delta=p+warp-u_shape[i].xy;
    vec2 turn=u_turn[i];
    vec2 q=vec2(delta.x*turn.x-delta.y*turn.y,delta.x*turn.y+delta.y*turn.x)/u_shape[i].zw;
    float d=length(q)+(fine.b-0.5)*0.08;
    float mask=1.0-smoothstep(1.0-feather,1.0+feather,d);
    float cloud=mix(large.b,large.a,mod(float(i),2.0));
    float uneven=0.55+cloud*0.8+(mid.b-0.5)*0.34;
    float edgeDistance=(d-(0.97-feather*0.28))/(0.014+feather*0.13);
    float ridge=exp(-edgeDistance*edgeDistance);
    ridge*=u_edges*(0.12+mid.a*0.45)*(1.0-u_wetness*0.45);
    vec2 b=q-u_bloom[i].xy;
    float bd=length(b)+(mid.a-0.5)*0.42+(fine.a-0.5)*0.13;
    float bloomRadius=0.2+u_blooms*(0.32+u_bloom[i].z);
    float bloom=(1.0-smoothstep(bloomRadius-0.09,bloomRadius+0.08,bd))*u_blooms;
    float bloomDistance=(bd-bloomRadius-0.045)/0.036;
    float bloomEdge=exp(-bloomDistance*bloomDistance)*u_blooms*0.33;
    float granulate=max(0.15,1.0+grain*u_granulation*0.85+(fine.g-0.5)*u_granulation*0.32);
    float density=(mask*uneven*(1.0-bloom*0.78)+ridge+bloomEdge*mask)*granulate;
    density*=u_pigment[i].a*u_pigmentStrength;
    absorption+=u_pigment[i].rgb*density;
  }
  vec3 paperColor=mix(vec3(0.995,0.994,0.989),vec3(0.99,0.949,0.867),u_warmth);
  vec3 color=mix(paperColor*exp(-absorption), vec3(0.035,0.065,0.05)+vec3(0.22,0.45,0.31)*(1.0-exp(-absorption))*1.5,u_dark);
  color*=1.0+grain*u_texture*0.095+(fiber.b-0.5)*u_texture*0.026;
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;
var Ke = null;
function Br() {
  if (Ke === !1 || typeof document > "u") return null;
  if (Ke) return Ke.lost ? null : Ke;
  let e = document.createElement("canvas"),
    t = e.getContext("webgl", {
      alpha: !1,
      antialias: !1,
      depth: !1,
      stencil: !1,
      preserveDrawingBuffer: !0,
    });
  if (!t) return ((Ke = !1), null);
  let n = t.createProgram();
  if (!n) return ((Ke = !1), null);
  try {
    for (let [d, l] of [
      [
        t.VERTEX_SHADER,
        "attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}",
      ],
      [t.FRAGMENT_SHADER, Tr],
    ]) {
      let u = t.createShader(d);
      if (
        (t.shaderSource(u, l),
        t.compileShader(u),
        !t.getShaderParameter(u, t.COMPILE_STATUS))
      ) {
        let p = t.getShaderInfoLog(u);
        throw (
          t.deleteShader(u),
          new Error(p ?? "Watercolor shader could not compile")
        );
      }
      (t.attachShader(n, u), t.deleteShader(u));
    }
    if ((t.linkProgram(n), !t.getProgramParameter(n, t.LINK_STATUS)))
      throw new Error(
        t.getProgramInfoLog(n) ?? "Watercolor shader could not link",
      );
    t.useProgram(n);
    let a = t.createBuffer();
    (t.bindBuffer(t.ARRAY_BUFFER, a),
      t.bufferData(
        t.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        t.STATIC_DRAW,
      ));
    let o = t.getAttribLocation(n, "position");
    (t.enableVertexAttribArray(o),
      t.vertexAttribPointer(o, 2, t.FLOAT, !1, 0, 0));
    let s = t.createTexture();
    (t.bindTexture(t.TEXTURE_2D, s),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MIN_FILTER, t.LINEAR),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MAG_FILTER, t.LINEAR),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_S, t.REPEAT),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_T, t.REPEAT),
      t.texImage2D(
        t.TEXTURE_2D,
        0,
        t.RGBA,
        qt,
        qt,
        0,
        t.RGBA,
        t.UNSIGNED_BYTE,
        st,
      ));
    let r = {};
    for (let d of [
      "dark",
      "res",
      "noise",
      "shape",
      "pigment",
      "turn",
      "bloom",
      "flow",
      "layers",
      "seed",
      "angle",
      "scale",
      "spread",
      "wetness",
      "pigmentStrength",
      "blooms",
      "granulation",
      "edges",
      "texture",
      "warmth",
      "veil",
    ])
      r[d] = t.getUniformLocation(n, `u_${d}`);
    t.uniform1i(r.noise, 0);
    let i = t.getParameter(t.MAX_VIEWPORT_DIMS),
      c = {
        canvas: e,
        gl: t,
        program: n,
        uniforms: r,
        lost: !1,
        shapes: new Float32Array(Zt * 4),
        colors: new Float32Array(Zt * 4),
        turns: new Float32Array(Zt * 2),
        blooms: new Float32Array(Zt * 3),
        maxSize: Math.min(
          t.getParameter(t.MAX_TEXTURE_SIZE),
          t.getParameter(t.MAX_RENDERBUFFER_SIZE),
          i[0],
          i[1],
        ),
      };
    return (
      e.addEventListener("webglcontextlost", (d) => {
        (d.preventDefault(), (c.lost = !0));
      }),
      e.addEventListener("webglcontextrestored", () => {
        Ke = null;
      }),
      (Ke = c),
      c
    );
  } catch (a) {
    return (
      t.deleteProgram(n),
      t.getExtension("WEBGL_lose_context")?.loseContext(),
      console.warn("Watercolors is using its Canvas renderer.", a),
      (Ke = !1),
      null
    );
  }
}
function Ia(e, t, n) {
  let a = Math.min(1, n / Math.max(e, t));
  return [Math.max(1, Math.round(e * a)), Math.max(1, Math.round(t * a))];
}
function Nt(e, t, n, a, o, s, r = "export", i = 0) {
  if (!(t > 0 && n > 0 && Number.isFinite(t) && Number.isFinite(n))) return;
  let c = vt(o),
    d = Aa(i),
    l = Br();
  if (!l) return;
  let [u, p] = Ia(t, n, l.maxSize),
    { gl: m, canvas: f, program: b, uniforms: h } = l;
  (f.width !== u && (f.width = u),
    f.height !== p && (f.height = p),
    m.viewport(0, 0, u, p),
    m.useProgram(b),
    m.uniform2f(h.res, u, p));
  let { shapes: g, colors: v, turns: L, blooms: w } = l;
  (Ra(c, a, s, d).forEach((I, E) => {
    (g.set([I.x, I.y, I.rx, I.ry], E * 4),
      v.set([...I.color, I.strength], E * 4),
      L.set([I.c, I.s], E * 2),
      w.set(I.bloom, E * 3));
  }),
    m.uniform4fv(h.shape, g),
    m.uniform4fv(h.pigment, v),
    m.uniform2fv(h.turn, L),
    m.uniform3fv(h.bloom, w),
    m.uniform4fv(h.flow, ka(d)));
  for (let I of [
    "spread",
    "wetness",
    "blooms",
    "granulation",
    "edges",
    "texture",
  ])
    m.uniform1f(h[I], c[I] / 100);
  (m.uniform1f(h.warmth, c.paperWarmth / 100),
    m.uniform1f(h.layers, c.layers),
    m.uniform1f(h.seed, c.seed),
    m.uniform1f(h.angle, (c.angle * Math.PI) / 180),
    m.uniform1f(h.scale, 1.75 - (c.scale / 100) * 1.2),
    m.uniform1f(h.pigmentStrength, (c.pigment / 100) * 1.05),
    m.uniform1f(h.veil, c.technique === "veil" ? 1 : 0),
    m.drawArrays(m.TRIANGLES, 0, 3),
    e.drawImage(f, 0, 0, t, n));
}
for (let e = 0; e < st.length; e++) st[e] = Math.floor(Or() * 256);

const stops = ["#F4F6F5", "#E3ECE6", "#568A67", "#194126"];
const params = {
  wetness: 84,
  pigment: 38,
  scale: 64,
  spread: 65,
  blooms: 12,
  granulation: 20,
  edges: 24,
  texture: 20,
  paperWarmth: 5,
  coverage: 72,
  seed: 571,
  angle: 324,
  layers: 6,
  technique: "veil",
};

export function paintWatercolor(canvas, seconds, dark = false) {
  const context = canvas.getContext("2d");
  const renderer = Br();
  if (!context || !renderer) return false;
  renderer.gl.useProgram(renderer.program);
  renderer.gl.uniform1f(renderer.uniforms.dark, dark ? 1 : 0);
  Nt(
    context,
    canvas.width,
    canvas.height,
    stops,
    params,
    [0.25, 0.5, 0.75],
    "interactive",
    seconds,
  );
  return true;
}

export function releaseWatercolor() {
  if (Ke && typeof Ke === "object") {
    Ke.gl.deleteProgram(Ke.program);
    Ke.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  Ke = null;
}
