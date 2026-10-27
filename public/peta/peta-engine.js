/* =====================================================================
   Peta Blok - Mesin Peta Dashboard Web Cek Blok
   Diadaptasi dari mesin peta aplikasi Cek Blok (public/app/index.html):
   GeoJSON + raster PDF (georeferensi otomatis / kalibrasi manual),
   proyeksi WGS84 & UTM 46-54 N/S, poligon blok, titik temuan (tagging),
   pan/zoom sentuh & mouse, hit-test, bar skala.
   API: window.PetaEngine
   ===================================================================== */
(function () {
  'use strict'
  const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), EP2 = E2 / (1 - E2), D2R = Math.PI / 180
  const PDF_MAXPX = 2048
  const LABEL_RE = /^(nama_?blok|kode_?blok|no_?blok|blok|block|blk|kd_?blok|id_?blok|name|nama)$/i
  const norm = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '')

  /* ================= Proyeksi (UTM / TM -> derajat) ================= */
  function tmInverse(E, N, p) {
    const x = E - p.fe, y = N - p.fn, k0 = p.k0
    const M = y / k0
    const mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256))
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu) + (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu)
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1)
    const C1 = EP2 * c * c, T1 = t * t, N1 = A / Math.sqrt(1 - E2 * s * s), R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5), D = x / (N1 * k0)
    const lat = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720)
    const lon = p.lon0 * D2R + (D - (1 + 2 * T1 + C1) * D * D * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c
    return [lon / D2R, lat / D2R]
  }
  function utmParams(zone, south) { return { kind: 'tm', k0: 0.9996, lon0: zone * 6 - 183, fe: 500000, fn: south ? 10000000 : 0 } }
  function parsePrj(txt) {
    if (!txt) return null; const t = String(txt)
    if (!/PROJCS|PROJCRS/i.test(t)) return /GEOGCS|GEOGCRS|GEODCRS/i.test(t) ? { kind: 'geo' } : null
    if (/Mercator_Auxiliary_Sphere|Pseudo.?Mercator|EPSG["',\s]+(3857|900913)/i.test(t)) return { kind: 'web' }
    const get = n => { const m = t.match(new RegExp('PARAMETER\\["' + n + '",\\s*([-+0-9.eE]+)\\]', 'i')); return m ? parseFloat(m[1]) : null }
    const cm = get('Central_Meridian'), fe = get('False_Easting'), fn = get('False_Northing'), k0 = get('Scale_Factor')
    if (cm != null && k0 != null) return { kind: 'tm', lon0: cm, fe: fe == null ? 0 : fe, fn: fn == null ? 0 : fn, k0 }
    let m = t.match(/UTM[_ ]zone[_ ]?(\d{1,2})\s*([NS])?/i)
    if (m) return utmParams(+m[1], (m[2] || 'N').toUpperCase() === 'S')
    m = t.match(/EPSG["',\s]+(32[67])(\d\d)/)
    if (m) return utmParams(+m[2], m[1] === '327')
    return null
  }
  function crsFromGeoJson(o) {
    const n = o && o.crs && o.crs.properties && o.crs.properties.name; if (!n) return null
    const m = String(n).match(/(\d{4,5})\s*$/); if (!m) return null; const code = +m[1]
    if (code === 4326 || code === 4979 || code === 4269) return { kind: 'geo' }
    if (code === 3857 || code === 900913) return { kind: 'web' }
    if (code >= 32601 && code <= 32660) return utmParams(code - 32600, false)
    if (code >= 32701 && code <= 32760) return utmParams(code - 32700, true)
    return null
  }
  function projFn(p) {
    if (!p || p.kind === 'geo') return xy => xy
    if (p.kind === 'web') return xy => [xy[0] / A / D2R, (2 * Math.atan(Math.exp(xy[1] / A)) - Math.PI / 2) / D2R]
    return xy => tmInverse(xy[0], xy[1], p)
  }

  /* ================= Parser GeoJSON ================= */
  function addGeom(g, proj, out) {
    if (!g) return; const c = g.coordinates, cut = q => proj([q[0], q[1]])
    switch (g.type) {
      case 'Point': out.push({ k: 'pt', parts: [[cut(c)]], p: {} }); break
      case 'MultiPoint': out.push({ k: 'pt', parts: [c.map(cut)], p: {} }); break
      case 'LineString': out.push({ k: 'line', parts: [c.map(cut)], p: {} }); break
      case 'MultiLineString': out.push({ k: 'line', parts: c.map(r => r.map(cut)), p: {} }); break
      case 'Polygon': out.push({ k: 'poly', parts: c.map(r => r.map(cut)), p: {} }); break
      case 'MultiPolygon': out.push({ k: 'poly', parts: c.flatMap(pg => pg.map(r => r.map(cut))), p: {} }); break
      case 'GeometryCollection': (g.geometries || []).forEach(x => addGeom(x, proj, out)); break
    }
  }
  function gjToFeatures(o, proj, out) {
    out = out || []; if (!o) return out
    if (o.type === 'FeatureCollection') { (o.features || []).forEach(f => gjToFeatures(f, proj, out)); return out }
    if (o.type === 'Feature') { addGeom(o.geometry, proj, out); const n = out.length; if (n && !out[n - 1].p) out[n - 1].p = o.properties || {}; if (n) out[n - 1].p = Object.assign(out[n - 1].p || {}, o.properties || {}); return out }
    addGeom(o, proj, out); return out
  }
  function detectProps(o, feats) {
    // kembalikan properties tiap feature dari GeoJSON (poligon butuh properti utk label)
    if (o.type !== 'FeatureCollection') return feats
    let fi = 0
    for (const f of (o.features || [])) {
      if (fi >= feats.length) break
      feats[fi].p = (f.properties || {}); fi++
      if (f.geometry && f.geometry.type === 'GeometryCollection') {
        // jumlah feature tidak 1:1; biarkan properti sama untuk bagian tambahan
        while (fi < feats.length && feats[fi].p && Object.keys(feats[fi].p).length === 0) { feats[fi].p = f.properties || {}; fi++ }
      }
    }
    return feats
  }

  /* ================= Simbol temuan (sama dengan aplikasi) ================= */
  const UNIT = { semak: 'Ha', tunasan: 'Pkk', titi: 'Unit', kerdil: 'Pkk', banjir: 'Ha', bukti: '' }
  const SYM = [
    { key: 'semak', label: 'Semak', color: '#dc2626', shape: 'tri' },
    { key: 'tunasan', label: 'Tunasan Bermasalah', color: '#7c3aed', shape: 'dia' },
    { key: 'titi', label: 'Tidak Ada Titi Panen', color: '#92400e', shape: 'sq' },
    { key: 'kerdil', label: 'Pokok Kerdil', color: '#db2777', shape: 'star' },
    { key: 'banjir', label: 'Areal Banjir', color: '#0891b2', shape: 'inv' },
    { key: 'bukti', label: 'Bukti Ancak', color: '#0f766e', shape: 'cross' }
  ]
  const SYMBY = Object.fromEntries(SYM.map(x => [x.key, x]))
  const SHAPES = {
    tri: [[0, -1], [.95, .8], [-.95, .8]], inv: [[0, 1], [.95, -.8], [-.95, -.8]], dia: [[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]],
    sq: [[-.85, -.85], [.85, -.85], [.85, .85], [-.85, .85]],
    star: (() => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .48 : 1.15; p.push([Math.cos(a) * r, Math.sin(a) * r]) } return p })(),
    cross: [[-.38, -1], [.38, -1], [.38, -.38], [1, -.38], [1, .38], [.38, .38], [.38, 1], [-.38, 1], [-.38, .38], [-1, .38], [-1, -.38], [-.38, -.38]]
  }
  function symSvg(type, size) {
    const d = SYMBY[type] || SYM[0], s = size || 16, h = s / 2; let sh
    if (d.shape === 'circle') sh = '<circle cx="' + h + '" cy="' + h + '" r="' + h * .8 + '"'
    else sh = '<polygon points="' + SHAPES[d.shape].map(p => (h + p[0] * h * .82).toFixed(1) + ',' + (h + p[1] * h * .82).toFixed(1)).join(' ') + '"'
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" aria-hidden="true">' + sh + ' fill="' + d.color + '" stroke="#fff" stroke-width="1"/></svg>'
  }
  const locOk = l => l && isFinite(l.latitude) && isFinite(l.longitude) && !(l.latitude === 0 && l.longitude === 0)
  function extractTemuan(rows) {
    const out = []
    for (const r of rows) {
      const D = r && r.record && r.record.details; if (!D) continue
      const rb = { pt: r.estate, kebun: r.kebun, afd: r.afdeling, blok: r.blok, tanggal: r.tanggal, pemeriksa: r.pemeriksa, rstatus: r.status, catatan: (r.record && r.record.catatan) || '', rid: r.id }
      Object.keys(D).forEach(key => {
        const d = D[key]; if (!d || !SYMBY[key]) return
        const items = [{ v: d.value, loc: d.location, smp: 1 }].concat((d.extras || []).map((x, i) => ({ v: x.value, loc: x.location, smp: i + 2 })))
        items.forEach(it => {
          if (!locOk(it.loc)) return
          out.push(Object.assign({ draft: false, type: key, value: Number(it.v) || 0, status: key === 'bukti' ? (d.status || '') : '', sample: it.smp, lat: +it.loc.latitude, lon: +it.loc.longitude, acc: it.loc.accuracy, src: it.loc.source, ts: it.loc.timestamp, photo: '' }, rb))
        })
      })
    }
    return out
  }

  /* ================= Georeferensi PDF (dari aplikasi) ================= */
  async function pdfGeoref(u8) {
    const txt = new TextDecoder('latin1').decode(u8)
    const objs = [], streams = []; const KEYS = /\/GPTS|\/Measure|\/Viewport|\/VP\b/
    let pos = 0
    for (;;) {
      const i = txt.indexOf(' obj', pos); if (i < 0) break; pos = i + 4
      const m = /(\d+)\s+(\d+)\s*$/.exec(txt.slice(Math.max(0, i - 24), i)); if (!m) continue
      const sp = txt.indexOf('stream', pos), ep = txt.indexOf('endobj', pos)
      const stop = (sp >= 0 && (ep < 0 || sp < ep)) ? sp : (ep < 0 ? txt.length : ep)
      const dict = txt.slice(pos, stop)
      if (KEYS.test(dict)) objs.push({ num: +m[1], dict })
      else if (stop === sp && /\/ObjStm/.test(dict) && /\/FlateDecode/.test(dict) && !/\/Predictor/.test(dict)) streams.push({ dict, start: sp + 6 })
      if (stop === sp) { const es = txt.indexOf('endstream', stop); if (es > 0) pos = es + 9 }
    }
    const nums = s => String(s).trim().split(/[\s,]+/).filter(Boolean).map(Number)
    const arr = (d, k) => { const mm = new RegExp('/' + k + '\\s*\\[([^\\]]*)\\]').exec(d); if (!mm) return null; const a = nums(mm[1]); return a.length && a.every(Number.isFinite) ? a : null }
    const pick = list => {
      const best = []
      for (const o of list) {
        const gp = arr(o.dict, 'GPTS'); if (!gp || gp.length < 6 || gp.length % 2) continue
        let lp = arr(o.dict, 'LPTS')
        const vp = list.find(v => new RegExp('/Measure\\s+' + o.num + '\\s+\\d+\\s+R').test(v.dict) && arr(v.dict, 'BBox')) || o
        const bb = arr(vp.dict, 'BBox'); if (!bb || bb.length < 4) continue
        if (!lp || lp.length !== gp.length) { if (gp.length === 8) lp = [0, 0, 0, 1, 1, 1, 1, 0]; else continue }
        best.push({ gp, lp, bb })
      }
      if (!best.length) return null
      const area = c => Math.abs((c.bb[2] - c.bb[0]) * (c.bb[3] - c.bb[1]))
      best.sort((a, b) => area(b) - area(a)); return best[0]
    }
    let cand = pick(objs)
    if (!cand && streams.length && typeof DecompressionStream !== 'undefined') {
      const more = []
      for (const s of streams) {
        try {
          let a = s.start; if (u8[a] === 13) a++; if (u8[a] === 10) a++
          let end; const lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(s.dict)
          if (lm && !lm[2]) end = a + (+lm[1]); else { end = txt.indexOf('endstream', a); while (end > a && (u8[end - 1] === 10 || u8[end - 1] === 13)) end-- }
          const n = +((/\/N\s+(\d+)/.exec(s.dict) || [])[1]), first = +((/\/First\s+(\d+)/.exec(s.dict) || [])[1]); if (!n || !first) continue
          const buf = await new Response(new Blob([u8.subarray(a, end)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
          const t = new TextDecoder('latin1').decode(buf), hd = nums(t.slice(0, first))
          for (let k = 0; k < n; k++) { const num = hd[2 * k], off = hd[2 * k + 1], nx = k + 1 < n ? hd[2 * k + 3] : t.length - first; const body = t.slice(first + off, first + nx); if (KEYS.test(body)) more.push({ num, dict: body }) }
        } catch (e) { console.warn('ObjStm', e) }
      }
      cand = pick(objs.concat(more))
    }
    if (!cand) return null
    const bb = [Math.min(cand.bb[0], cand.bb[2]), Math.min(cand.bb[1], cand.bb[3]), Math.max(cand.bb[0], cand.bb[2]), Math.max(cand.bb[1], cand.bb[3])]
    const pts = []; for (let i = 0; i < cand.gp.length; i += 2) pts.push({ lx: cand.lp[i], ly: cand.lp[i + 1], lat: cand.gp[i], lon: cand.gp[i + 1] })
    if (pts.some(p => Math.abs(p.lat) > 90) && pts.every(p => Math.abs(p.lon) <= 90)) pts.forEach(p => { const t = p.lat; p.lat = p.lon; p.lon = t })
    if (pts.some(p => Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) return null
    return { bb, pts }
  }
  function fitAffine(P) {
    const n = P.length; if (n < 3) return null
    let mx = 0, my = 0, ml = 0, mt = 0; for (const p of P) { mx += p.px; my += p.py; ml += p.lon; mt += p.lat } mx /= n; my /= n; ml /= n; mt /= n
    let a = 0, b = 0, c = 0; const sl = [0, 0], st = [0, 0]
    for (const p of P) { const x = p.px - mx, y = p.py - my; a += x * x; b += x * y; c += y * y; sl[0] += x * (p.lon - ml); sl[1] += y * (p.lon - ml); st[0] += x * (p.lat - mt); st[1] += y * (p.lat - mt) }
    const det = a * c - b * b; if (!(Math.abs(det) > 1e-9 * (a * c || 1))) return null
    const solve = r => [(r[0] * c - b * r[1]) / det, (a * r[1] - b * r[0]) / det]
    const [A1, B1] = solve(sl), [C1, D1] = solve(st)
    return [A1, B1, ml - A1 * mx - B1 * my, C1, D1, mt - C1 * mx - D1 * my]
  }
  const affDet = g => g[0] * g[4] - g[1] * g[3]
  function fixMirroredGeo(geo, vp, crop, P, gt) {
    if (!geo || affDet(gt) < 0) return { P, gt, note: '' }
    const ox = crop ? crop[0] : 0, oy = crop ? crop[1] : 0
    const build = pts => pts.map(p => { const q = vp.convertToViewportPoint(geo.bb[0] + p.lx * (geo.bb[2] - geo.bb[0]), geo.bb[1] + p.ly * (geo.bb[3] - geo.bb[1])); return { px: q[0] - ox, py: q[1] - oy, lon: p.lon, lat: p.lat } })
    const cands = [
      ['lintang dan bujur tertukar', geo.pts.map(p => (Object.assign({}, p, { lat: p.lon, lon: p.lat })))],
      ['sumbu Y titik acuan terbalik', geo.pts.map(p => (Object.assign({}, p, { ly: 1 - p.ly })))]
    ]
    for (const [nm, pts] of cands) {
      const Q = build(pts), g = fitAffine(Q)
      if (g && affDet(g) < 0 && Q.every(q => Math.abs(q.lat) <= 90 && Math.abs(q.lon) <= 180)) return { P: Q, gt: g, note: nm }
    }
    return { P, gt, note: '', mirrored: true }
  }
  let pdfPromise = null
  async function loadPdfjs() {
    if (window.pdfjsLib) return window.pdfjsLib
    if (pdfPromise) return pdfPromise
    pdfPromise = (async () => {
      const a = await fetch('/app/pdf.min.js').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text() })
      const mod = await import(URL.createObjectURL(new Blob([a], { type: 'text/javascript' })))
      const w = await fetch('/app/pdf.worker.min.js').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text() })
      mod.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([w], { type: 'text/javascript' }))
      return mod
    })().catch(e => { pdfPromise = null; throw e })
    return pdfPromise
  }
  async function pdfPrepare(file, opt) {
    opt = opt || {}
    const buf = new Uint8Array(await file.arrayBuffer())
    if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== '%PDF') throw new Error('bukan berkas PDF')
    let geo = null; try { geo = await pdfGeoref(buf) } catch (e) { console.warn(e) }
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data: buf.slice(), isEvalSupported: false }).promise
    let pn = 1; if (doc.numPages > 1) { const a = prompt('PDF ini punya ' + doc.numPages + ' halaman. Pakai halaman nomor berapa? (1-' + doc.numPages + ')', '1'); pn = Math.max(1, Math.min(doc.numPages, parseInt(a, 10) || 1)) }
    const page = await doc.getPage(pn)
    const base = page.getViewport({ scale: 1 })
    const sc = Math.min(PDF_MAXPX / Math.max(base.width, base.height), 8)
    const vp = page.getViewport({ scale: sc })
    let cvs = document.createElement('canvas'); cvs.width = Math.max(1, Math.round(vp.width)); cvs.height = Math.max(1, Math.round(vp.height))
    const c2 = cvs.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, cvs.width, cvs.height)
    await page.render({ canvasContext: c2, viewport: vp }).promise
    let P = [], crop = null
    if (geo) {
      P = geo.pts.map(p => { const q = vp.convertToViewportPoint(geo.bb[0] + p.lx * (geo.bb[2] - geo.bb[0]), geo.bb[1] + p.ly * (geo.bb[3] - geo.bb[1])); return { px: q[0], py: q[1], lon: p.lon, lat: p.lat } })
      const a = vp.convertToViewportPoint(geo.bb[0], geo.bb[1]), b = vp.convertToViewportPoint(geo.bb[2], geo.bb[3])
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]))), y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]))), x1 = Math.min(cvs.width, Math.ceil(Math.max(a[0], b[0]))), y1 = Math.min(cvs.height, Math.ceil(Math.max(a[1], b[1])))
      if (x1 - x0 > 50 && y1 - y0 > 50 && (x1 - x0) * (y1 - y0) < 0.97 * cvs.width * cvs.height) crop = [x0, y0, x1 - x0, y1 - y0]
    } else if (opt.noGeoRef === 'skip') {
      try { page.cleanup(); doc.destroy() } catch (e) {}
      throw new Error('PDF tanpa georeferensi')
    } else {
      const askLatLon = t => {
        const s = prompt(t, ''); if (!s) return null
        let toks = s.replace(/;/g, ' ').trim().split(/\s+/).map(x => x.replace(/,+$/, '')); if (toks.length < 2) toks = s.split(',')
        const v = toks.slice(0, 2).map(x => parseFloat(String(x).replace(',', '.')))
        if (v.length < 2 || !v.every(isFinite) || Math.abs(v[0]) > 90 || Math.abs(v[1]) > 180) return null; return v
      }
      const tl = askLatLon('PDF ini tidak punya georeferensi (bukan GeoPDF/Avenza).\nMasukkan koordinat pojok KIRI-ATAS peta: lintang bujur (derajat desimal, pisahkan dengan spasi). Contoh: -0.0265 109.3425\nKosongkan untuk batal.')
      if (!tl) { try { page.cleanup(); doc.destroy() } catch (e) {} ; throw new Error('dibatalkan (PDF tanpa georeferensi)') }
      const br = askLatLon('Sekarang koordinat pojok KANAN-BAWAH peta: lintang bujur. Contoh: -0.0610 109.3890')
      if (!br) { try { page.cleanup(); doc.destroy() } catch (e) {} ; throw new Error('dibatalkan (PDF tanpa georeferensi)') }
      if (!(tl[0] > br[0] && tl[1] < br[1])) { try { page.cleanup(); doc.destroy() } catch (e) {} ; throw new Error('pojok KIRI-ATAS harus lebih ke utara (lintang lebih besar) dan lebih ke barat (bujur lebih kecil) daripada pojok KANAN-BAWAH. Periksa urutan lintang-bujur dan tanda minus.') }
      P = [{ px: 0, py: 0, lat: tl[0], lon: tl[1] }, { px: cvs.width, py: 0, lat: tl[0], lon: br[1] }, { px: cvs.width, py: cvs.height, lat: br[0], lon: br[1] }, { px: 0, py: cvs.height, lat: br[0], lon: tl[1] }]
    }
    if (crop) { const cc = document.createElement('canvas'); cc.width = crop[2]; cc.height = crop[3]; cc.getContext('2d').drawImage(cvs, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]); cvs = cc; P.forEach(p => { p.px -= crop[0]; p.py -= crop[1] }) }
    let gt = fitAffine(P); if (!gt) { try { page.cleanup(); doc.destroy() } catch (e) {} ; throw new Error('titik georeferensi tidak valid') }
    const fx = fixMirroredGeo(geo, vp, crop, P, gt); P = fx.P; gt = fx.gt
    const note = fx.note ? 'dikoreksi otomatis: ' + fx.note : (fx.mirrored ? 'PERINGATAN: georeferensi PDF tampak terbalik' : '')
    const dataUrl = cvs.toDataURL('image/jpeg', 0.88)
    try { page.cleanup(); doc.destroy() } catch (e) {}
    return { dataUrl, gt, w: cvs.width, h: cvs.height, note, georef: !!geo }
  }

  /* ================= Mesin peta (instance) ================= */
  const KMIN = 0.5, KMAX = 5e7
  const fmtNum = v => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('id-ID')

  function create(opt) {
    const cv = opt.canvas
    const ctx = cv.getContext('2d')
    const msg = opt.msg || function () {}
    let layers = [], temuan = [], temuanVisible = true
    let labelField = '', W = 0, H = 0, dpr = 1, dirty = true, fitted = false
    let view = { cx: 0, cy: 0, k: 1 }, cos0 = 1
    let blokFill = null // Map(normKey -> warna poligon)
    const inst = {}

    function resize() {
      dpr = window.devicePixelRatio || 1
      W = cv.clientWidth || 300; H = cv.clientHeight || 200
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      dirty = true
    }
    function schedule() { dirty = true }
    function loop() { if (dirty) { dirty = false; draw() } requestAnimationFrame(loop) }

    function rasterCorners(L) {
      const g = L.raster.gt
      const pts = [[0, 0], [L.raster.w, 0], [L.raster.w, L.raster.h], [0, L.raster.h]]
      return pts.map(p => [g[0] * p[0] + g[1] * p[1] + g[2], g[3] * p[0] + g[4] * p[1] + g[5]])
    }
    function rebuild() {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
      for (const L of layers) for (const f of L.feats) for (const r of f.parts) for (const q of r) { if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1] }
      for (const L of layers) if (L.raster) for (const q of rasterCorners(L)) { if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1] }
      if (minx > maxx) { cos0 = 1; view.gb = null; return }
      cos0 = Math.cos(((miny + maxy) / 2) * Math.PI / 180) || 1
      view.gb = [minx * cos0, miny, maxx * cos0, maxy]
      for (const L of layers) if (L.raster) { const c = rasterCorners(L).map(q => [q[0] * cos0, q[1]]); L.raster.bb = [Math.min(...c.map(q => q[0])), Math.min(...c.map(q => q[1])), Math.max(...c.map(q => q[0])), Math.max(...c.map(q => q[1]))] }
      for (const L of layers) for (const f of L.feats) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
        f.w = f.parts.map(r => { const a = new Float64Array(r.length * 2); r.forEach((q, i) => { const x = q[0] * cos0, y = q[1]; a[2 * i] = x; a[2 * i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }); return a })
        f.bb = [x0, y0, x1, y1]; f.c = [(x0 + x1) / 2, (y0 + y1) / 2]
        if (f.k === 'poly') {
          let best = null, bestA = -1
          for (const a of f.w) { let A2 = 0, cx = 0, cy = 0; const n = a.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const cr = a[2 * j] * a[2 * i + 1] - a[2 * i] * a[2 * j + 1]; A2 += cr; cx += (a[2 * j] + a[2 * i]) * cr; cy += (a[2 * j + 1] + a[2 * i + 1]) * cr } const ar = Math.abs(A2); if (ar > bestA && ar > 0) { bestA = ar; best = [cx / (3 * A2), cy / (3 * A2)] } }
          if (best && best[0] >= x0 && best[0] <= x1 && best[1] >= y0 && best[1] <= y1) f.c = best
        }
      }
      relabel()
    }
    function relabel() {
      for (const L of layers) for (const f of L.feats) { const v = labelField ? f.p[labelField] : ''; f.label = (v == null || v === '') ? '' : String(v); f.key = norm(f.label) }
      schedule()
    }
    function fieldsList() { const out = [], s = new Set(); for (const L of layers) for (const k of L.fields) if (!s.has(k)) { s.add(k); out.push(k) } return out }

    inst.resize = resize
    inst.schedule = schedule
    inst.fieldsList = () => fieldsList()
    inst.getLabelField = () => labelField
    inst.setLabelField = f => { labelField = f; relabel() }
    inst.autoLabelField = () => { const fl = fieldsList(); if (!fl.includes(labelField)) labelField = fl.find(k => LABEL_RE.test(k)) || fl.find(k => /blok|block/i.test(k)) || ''; relabel(); return labelField }

    inst.addVectorLayer = function (id, name, geojsonObj) {
      const proj = projFn(crsFromGeoJson(geojsonObj))
      const feats = gjToFeatures(geojsonObj, proj, [])
      detectProps(geojsonObj, feats)
      const fields = []; { const s = new Set(); for (const f of feats) for (const k of Object.keys(f.p || {})) if (!s.has(k)) { s.add(k); fields.push(k) } }
      layers = layers.filter(L => L.id !== id)
      layers.push({ id, name, type: 'vector', fields, feats, visible: true, opacity: 1 })
      fitted = false; rebuild(); inst.autoLabelField()
    }
    inst.addRasterLayer = function (id, name, img, gt, opacity) {
      layers = layers.filter(L => L.id !== id)
      layers.push({ id, name, type: 'raster', fields: [], feats: [], raster: { img, w: img.width, h: img.height, gt }, visible: true, opacity: opacity == null ? 1 : opacity })
      fitted = false; rebuild()
    }
    inst.removeLayer = function (id) { layers = layers.filter(L => L.id !== id); fitted = false; rebuild() }
    inst.setLayerVisible = function (id, v) { const L = layers.find(x => x.id === id); if (L) { L.visible = v; schedule() } }
    inst.setLayerOpacity = function (id, o) { const L = layers.find(x => x.id === id); if (L) { L.opacity = o; schedule() } }
    inst.hasLayers = () => layers.length > 0

    inst.setTemuan = function (list) { temuan = list || []; fitted = false; schedule() }
    inst.setTemuanVisible = v => { temuanVisible = v; schedule() }
    inst.setBlokFill = function (map) { blokFill = map; schedule() }
    /* View saat ini — dipakai ekspor PDF georeferensi (Avenza) */
    inst.getView = function () { return { cx: view.cx, cy: view.cy, k: view.k, cos0: cos0, W: W, H: H, dpr: dpr, adaLapisan: layers.some(L => L.visible !== false) } }

    function fitBounds(bb) {
      if (!bb || !W || !H) return
      const w = bb[2] - bb[0], h = bb[3] - bb[1]
      if (w <= 0 || h <= 0 || !isFinite(w) || !isFinite(h)) return
      view.k = Math.min(KMAX, Math.max(KMIN, Math.min(W / w, H / h) * 0.92))
      view.cx = (bb[0] + bb[2]) / 2; view.cy = (bb[1] + bb[3]) / 2
      schedule()
    }
    inst.fit = function () {
      let b = view.gb
      if (temuanVisible && temuan.length) {
        for (const t of temuan) { const x = t.lon * cos0, y = t.lat; if (!b) b = [x, y, x, y]; else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y } }
      }
      if (b) { fitBounds(b); fitted = true }
    }
    function zoomAt(px, py, f) {
      const nk = Math.min(KMAX, Math.max(KMIN, view.k * f))
      const wx = (px - W / 2) / view.k + view.cx, wy = view.cy - (py - H / 2) / view.k
      view.cx = wx - (px - W / 2) / nk; view.cy = wy + (py - H / 2) / nk; view.k = nk
      schedule()
    }
    inst.zoomIn = () => zoomAt(W / 2, H / 2, 1.6)
    inst.zoomOut = () => zoomAt(W / 2, H / 2, 1 / 1.6)

    /* ---- gambar ---- */
    function pathPart(c, a, sx, sy, close) {
      c.moveTo(sx(a[0]), sy(a[1]))
      for (let i = 1; i < a.length / 2; i++) c.lineTo(sx(a[2 * i]), sy(a[2 * i + 1]))
      if (close) c.closePath()
    }
    function drawSym(c, type, x, y, r) {
      const d = SYMBY[type] || SYM[0]
      c.save(); c.lineJoin = 'round'
      c.beginPath()
      SHAPES[d.shape].forEach((p, i) => { const px = x + p[0] * r, py = y + p[1] * r; i ? c.lineTo(px, py) : c.moveTo(px, py) })
      c.closePath()
      c.fillStyle = d.color; c.fill()
      c.lineWidth = 1.8; c.strokeStyle = '#fff'; c.stroke()
      c.lineWidth = .8; c.strokeStyle = 'rgba(0,0,0,.55)'; c.stroke()
      c.restore()
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
      const k = view.k, sx = x => (x - view.cx) * k + W / 2, sy = y => (view.cy - y) * k + H / 2
      const vx0 = view.cx - W / 2 / k, vx1 = view.cx + W / 2 / k, vy0 = view.cy - H / 2 / k, vy1 = view.cy + H / 2 / k
      const vis = layers.filter(L => L.visible !== false)
      const inView = f => !(f.bb[2] < vx0 || f.bb[0] > vx1 || f.bb[3] < vy0 || f.bb[1] > vy1)
      ctx.lineJoin = 'round'
      for (const L of vis) {
        const R = L.raster; if (!R || !R.img || !R.bb) continue
        if (R.bb[2] < vx0 || R.bb[0] > vx1 || R.bb[3] < vy0 || R.bb[1] > vy1) continue
        const g = R.gt
        ctx.save(); ctx.globalAlpha = L.opacity == null ? 1 : L.opacity; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
        ctx.transform(k * cos0 * g[0], -k * g[3], k * cos0 * g[1], -k * g[4], k * (cos0 * g[2] - view.cx) + W / 2, k * (view.cy - g[5]) + H / 2)
        ctx.drawImage(R.img, 0, 0); ctx.restore()
      }
      for (const L of vis) {
        ctx.lineWidth = 1.2; ctx.strokeStyle = '#14532d'
        for (const f of L.feats) {
          if (f.k !== 'poly' || !inView(f)) continue
          const col = blokFill && blokFill[f.key]
          ctx.fillStyle = col || 'rgba(34,197,94,.28)'
          ctx.beginPath(); for (const a of f.w) pathPart(ctx, a, sx, sy, true); ctx.fill('evenodd'); ctx.stroke()
        }
      }
      ctx.lineWidth = 2; ctx.strokeStyle = '#1d4ed8'
      for (const L of vis) for (const f of L.feats) { if (f.k !== 'line' || !inView(f)) continue; ctx.beginPath(); for (const a of f.w) pathPart(ctx, a, sx, sy, false); ctx.stroke() }
      ctx.fillStyle = '#ea580c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
      for (const L of vis) for (const f of L.feats) { if (f.k !== 'pt' || !inView(f)) continue; for (const a of f.w) for (let i = 0; i < a.length; i += 2) { ctx.beginPath(); ctx.arc(sx(a[i]), sy(a[i + 1]), 4, 0, 6.283); ctx.fill(); ctx.stroke() } }
      if (labelField) {
        ctx.font = '600 12px Segoe UI,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.fillStyle = '#052e16'
        for (const L of vis) for (const f of L.feats) {
          if (!f.label || !inView(f)) continue
          const w = (f.bb[2] - f.bb[0]) * k, h = (f.bb[3] - f.bb[1]) * k
          if (f.k === 'poly' && (w < ctx.measureText(f.label).width + 10 || h < 16)) continue
          const x = f.k === 'pt' ? sx(f.w[0][0]) : sx(f.c[0]), y = f.k === 'pt' ? sy(f.w[0][1]) - 12 : sy(f.c[1])
          ctx.strokeText(f.label, x, y); ctx.fillText(f.label, x, y)
        }
      }
      if (temuanVisible) {
        const mpp0 = 111320 / k, showVal = mpp0 < 8, r = 8
        ctx.font = '700 11px Segoe UI,Arial,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        for (const t of temuan) {
          const x = sx(t.lon * cos0), y = sy(t.lat)
          if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue
          drawSym(ctx, t.type, x, y, r)
          if (showVal) { const lb = (t.type === 'bukti' ? (t.status || 'Ancak') : fmtNum(t.value) + ' ' + (UNIT[t.type] || '')); if (lb) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.fillStyle = '#111827'; ctx.strokeText(lb, x + r + 4, y); ctx.fillText(lb, x + r + 4, y) } }
        }
      }
      const mpp = 111320 / k
      const len = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find(v => v / mpp >= 70) || 100000
      const px = len / mpp
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(8, H - 26, px + 16, 20); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, H - 14); ctx.lineTo(16, H - 10); ctx.lineTo(16 + px, H - 10); ctx.lineTo(16 + px, H - 14); ctx.stroke()
      ctx.fillStyle = '#111'; ctx.font = '11px Segoe UI,Arial,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(len >= 1000 ? (len / 1000) + ' km' : len + ' m', 18, H - 15)
      if (!layers.length && !temuan.length) { ctx.fillStyle = '#64748b'; ctx.font = '14px Segoe UI,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Impor peta GeoJSON / PDF untuk mulai, lalu hasil pemeriksaan digambar di sini', W / 2, H / 2) }
    }

    /* ---- hit test ---- */
    function inRing(a, x, y) { let c = false; const n = a.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = a[2 * i], yi = a[2 * i + 1], xj = a[2 * j], yj = a[2 * j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c } return c }
    function inPoly(f, x, y) { if (x < f.bb[0] || x > f.bb[2] || y < f.bb[1] || y > f.bb[3]) return false; let c = false; for (const a of f.w) if (inRing(a, x, y)) c = !c; return c }
    function featureAt(wx, wy, tolPx) {
      const tol = tolPx / view.k
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; if (L.visible === false) continue; for (const f of L.feats) { if (f.k === 'poly' && inPoly(f, wx, wy)) return f } }
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; if (L.visible === false) continue
        for (const f of L.feats) { if (f.k === 'poly') continue
          if (wx < f.bb[0] - tol || wx > f.bb[2] + tol || wy < f.bb[1] - tol || wy > f.bb[3] + tol) continue
          for (const a of f.w) { const n = a.length / 2
            if (f.k === 'pt') { for (let j = 0; j < n; j++) if (Math.hypot(a[2 * j] - wx, a[2 * j + 1] - wy) <= tol) return f }
            else for (let j = 1; j < n; j++) { const x1 = a[2 * j - 2], y1 = a[2 * j - 1], x2 = a[2 * j], y2 = a[2 * j + 1]; const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; let t = l2 ? ((wx - x1) * dx + (wy - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); if (Math.hypot(x1 + t * dx - wx, y1 + t * dy - wy) <= tol) return f } } } }
      return null
    }
    function hitTemuan(px, py) {
      const k = view.k
      if (!temuanVisible) return null
      for (let i = temuan.length - 1; i >= 0; i--) { const t = temuan[i], x = (t.lon * cos0 - view.cx) * k + W / 2, y = (view.cy - t.lat) * k + H / 2; if (Math.hypot(x - px, y - py) <= 15) return t }
      return null
    }

    /* ---- interaksi pointer ---- */
    const ptrs = new Map(); let moved = 0, pinch = null
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, pos(e)); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) } })
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; const p = pos(e), old = ptrs.get(e.pointerId)
      if (ptrs.size === 1) { const dx = p.x - old.x, dy = p.y - old.y; view.cx -= dx / view.k; view.cy += dy / view.k; moved += Math.abs(dx) + Math.abs(dy); ptrs.set(e.pointerId, p); schedule() }
      else if (ptrs.size === 2) { ptrs.set(e.pointerId, p); const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch && d > 0) { zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch) } pinch = d; moved += 10 }
    })
    function endPtr(e) {
      const wasOne = ptrs.size === 1; const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null
      if (e.type === 'pointerup' && wasOne && moved < 6 && p) {
        const wx = (p.x - W / 2) / view.k + view.cx, wy = view.cy - (p.y - H / 2) / view.k
        const th = hitTemuan(p.x, p.y)
        if (opt.onTap) opt.onTap(th ? { kind: 'temuan', data: th } : { kind: 'feature', data: featureAt(wx, wy, 12) })
        schedule()
      }
    }
    cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr)
    cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.3 : 1 / 1.3) }, { passive: false })

    resize(); loop()
    return inst
  }

  /* ================= Ekspor PDF georeferensi (siap Avenza) =================
     PDF minimalis TANPA pustaka: gambar JPEG dari kanvas + kamus /Measure
     (LGINDict GPTS/LPTS) supaya Avenza Maps membaca georeferensinya. */
  function avenzaPdf(imgDataUrl, view, opt) {
    opt = opt || {}
    const Wpx = Math.max(1, Math.round(view.W * (view.dpr || 1)))
    const Hpx = Math.max(1, Math.round(view.H * (view.dpr || 1)))
    /* halaman PDF: sisi panjang maks 2000 pt, rasio mengikuti gambar */
    const sc = Math.min(1, 2000 / Math.max(Wpx, Hpx))
    const Wp = Math.round(Wpx * sc), Hp = Math.round(Hpx * sc)

    /* pojok geografis tampilan saat ini (dunia x = lon * cos0) */
    const c0 = Math.abs(view.cos0 || 1) < 0.05 ? 0.05 : (view.cos0 || 1)
    const lonL = (view.cx - view.W / (2 * view.k)) / c0
    const lonR = (view.cx + view.W / (2 * view.k)) / c0
    const latT = view.cy + view.H / (2 * view.k)
    const latB = view.cy - view.H / (2 * view.k)
    /* urutan LPTS: BL, BR, TR, TL (0..1, titik nol kiri-bawah halaman) */
    const lpts = [0, 0, 1, 0, 1, 1, 0, 1]
    const gpts = [latB, lonL, latB, lonR, latT, lonR, latT, lonL]
    const f6 = n => Number(n).toFixed(6)
    const gptsS = gpts.map(f6).join(' ')
    const lptsS = lpts.map(n => n.toFixed(4)).join(' ')
    const boundsS = `0 0 ${Wp} 0 ${Wp} ${Hp} 0 ${Hp}`

    const WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    const jpegB64 = String(imgDataUrl).replace(/^data:image\/jpeg;base64,/, '')
    const bin = atob(jpegB64)
    const img = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i)

    const judul = String(opt.title || 'Peta Cek Blok').replace(/[()\\]/g, ' ')
    const sub = String(opt.sub || '').replace(/[()\\]/g, ' ')
    const footer = judul + (sub ? ' - ' + sub : '')

    const enc = new TextEncoder()
    const head = enc.encode('%PDF-1.6\n%\u00e2\u00e3\u00cf\u00d3\n')
    const parts = [head]
    let pos = head.length
    const offsets = [0, 0, 0, 0, 0, 0, 0, 0] /* indeks 1..7 */
    function addObj(n, data) {
      offsets[n] = pos
      const hdr = enc.encode(`${n} 0 obj\n`)
      const end = enc.encode('\nendobj\n')
      let body
      if (typeof data === 'string') body = enc.encode(data)
      else if (data && data.stream) {
        const d = enc.encode(data.dict + '\nstream\n')
        const e = enc.encode('\nendstream')
        body = new Uint8Array(d.length + data.stream.length + e.length)
        body.set(d, 0); body.set(data.stream, d.length); body.set(e, d.length + data.stream.length)
      } else body = data
      parts.push(hdr, body, end)
      pos += hdr.length + body.length + end.length
    }

    const measure =
      `<< /Type /Measure /Subtype /LGINDict /Description (${judul})\n` +
      ` /LGIDict [ << /Version 2.01 /Type /LGIDict /Bounds [${boundsS}]\n` +
      ` /Projection << /Type /Projection /ProjectionType Geographic /WKT (${WKT}) >>\n` +
      ` /CoordinateSystem << /Type /LCS /WKT (${WKT}) >>\n` +
      ` /GPTS [${gptsS}]\n /LPTS [${lptsS}] >> ] >>`

    addObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    addObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Wp} ${Hp}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> /Font << /F1 6 0 R >> >> ` +
      `/Contents 4 0 R ${measure} >>`)
    const content = `q ${Wp} 0 0 ${Hp} 0 0 cm /Im0 Do Q\nBT /F1 9 Tf 1 0 0 1 10 10 Tm 0.13 0.30 0.16 rg (${footer}) Tj ET\n`
    addObj(4, { stream: enc.encode(content), dict: `<< /Length ${content.length} >>` })
    addObj(5, { stream: img, dict: `<< /Type /XObject /Subtype /Image /Width ${Wpx} /Height ${Hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>` })
    addObj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    addObj(7, `<< /Title (${judul}) /Producer (Server Cek Blok) >>`)

    const xrefPos = pos
    let xref = `xref\n0 8\n0000000000 65535 f \n`
    for (let n = 1; n <= 7; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n'
    const trailer = `trailer\n<< /Size 8 /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
    parts.push(enc.encode(xref + trailer))

    const total = parts.reduce((s, p) => s + p.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
  }

  window.PetaEngine = {
    create, extractTemuan, pdfPrepare, avenzaPdf, symSvg, SYM, SYMBY, UNIT, norm,
    parsePrj, crsFromGeoJson,
  }
})()
