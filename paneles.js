// Paneles especiales de DeckPilot: logo, pantalla de inicio, monitor de rendimiento y visualizador de musica.

const FUENTE = '"Segoe UI Semibold", "Segoe UI", Arial, sans-serif'
const FUENTE_B = '"Segoe UI", Arial, sans-serif'

function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

// ---------------- Logo (original): el controlador visto de frente ----------------
export function dibujarLogo(ctx, s, { fondo = true, encendidas = 12, luces = 8 } = {}) {
    ctx.save()
    if (fondo) {
        const g = ctx.createLinearGradient(0, 0, s, s)
        g.addColorStop(0, '#1b1446')
        g.addColorStop(1, '#3a1170')
        rr(ctx, 0, 0, s, s, s * 0.22)
        ctx.fillStyle = g
        ctx.fill()
        // brillo suave arriba
        const b = ctx.createRadialGradient(s * 0.3, s * 0.1, 0, s * 0.3, s * 0.1, s * 0.8)
        b.addColorStop(0, 'rgba(0,229,255,0.25)')
        b.addColorStop(1, 'rgba(0,229,255,0)')
        ctx.fillStyle = b
        rr(ctx, 0, 0, s, s, s * 0.22)
        ctx.fill()
    }
    // cuerpo del controlador (en tamanos chicos ocupa mas espacio para que se lea)
    const pequeno = s < 40
    const bx = s * (pequeno ? 0.06 : 0.1), by = s * (pequeno ? 0.17 : 0.22), bw = s * (pequeno ? 0.88 : 0.8), bh = s * (pequeno ? 0.66 : 0.56)
    rr(ctx, bx, by, bw, bh, s * 0.07)
    ctx.fillStyle = '#0b0b10'
    ctx.fill()
    ctx.lineWidth = Math.max(1, s * 0.012)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.stroke()

    // pantalla con la cuadricula de teclas 4x3
    const sx = bx + bw * (pequeno ? 0.06 : 0.17), sy = by + bh * (pequeno ? 0.08 : 0.1), sw = bw * (pequeno ? 0.88 : 0.66), sh = bh * (pequeno ? 0.84 : 0.62)
    const colores = [['#00e5ff', '#2979ff', '#00e5ff', '#7c4dff'], ['#7c4dff', '#ff4081', '#2979ff', '#00e5ff'], ['#ff4081', '#00e5ff', '#7c4dff', '#ff9100']]
    const cols = 4, filas = 3, gap = sw * (pequeno ? 0.06 : 0.04)
    const kw = (sw - gap * (cols + 1)) / cols, kh = (sh - gap * (filas + 1)) / filas
    for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) {
        const x = sx + gap + c * (kw + gap), y = sy + gap + f * (kh + gap)
        // en la animacion de inicio las teclas se prenden una por una
        if (f * 4 + c >= encendidas && encendidas < 12) {
            rr(ctx, x, y, kw, kh, Math.max(1, kw * 0.22))
            ctx.fillStyle = '#1c1c26'
            ctx.fill()
            continue
        }
        const g = ctx.createLinearGradient(x, y, x, y + kh)
        g.addColorStop(0, colores[f][c])
        g.addColorStop(1, shade(colores[f][c], 0.55))
        rr(ctx, x, y, kw, kh, Math.max(1, kw * 0.22))
        ctx.fillStyle = g
        ctx.fill()
    }
    if (!pequeno) {
        // perillas a los lados
        for (let i = 0; i < 3; i++) {
            const cy = sy + sh * (0.17 + i * 0.33)
            for (const cx of [bx + bw * 0.085, bx + bw * 0.915]) {
                ctx.beginPath(); ctx.arc(cx, cy, bw * 0.045, 0, Math.PI * 2)
                ctx.fillStyle = '#2a2a33'; ctx.fill()
                ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, s * 0.008); ctx.stroke()
            }
        }
        // fila de botones redondos con luz
        const luces = ['#00e5ff', '#2979ff', '#7c4dff', '#ff4081', '#ff9100', '#00e676', '#ffea00', '#ffffff']
        for (let i = 0; i < Math.min(8, luces); i++) {
            const cx = bx + bw * (0.16 + i * 0.097), cy = by + bh * 0.86
            ctx.beginPath(); ctx.arc(cx, cy, bw * 0.03, 0, Math.PI * 2)
            ctx.fillStyle = luces[i]
            ctx.shadowColor = luces[i]; ctx.shadowBlur = s * 0.03
            ctx.fill()
            ctx.shadowBlur = 0
        }
    }
    ctx.restore()
}

function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16)
    const c = v => Math.round(v * f)
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`
}

// ---------------- Pantalla de inicio en el controlador ----------------
export function pintarSplash(ctx, w, h, nombre = 'DeckPilot', sub = 'Listo', t = 1) {
    // t va de 0 a 1: teclas que se prenden, luego aparece el nombre
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, w * 0.75)
    g.addColorStop(0, '#2a1670')
    g.addColorStop(1, '#000000')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // halo que crece
    const halo = ctx.createRadialGradient(w / 2, 94, 0, w / 2, 94, 40 + 90 * t)
    halo.addColorStop(0, `rgba(0,229,255,${0.28 * t})`)
    halo.addColorStop(1, 'rgba(0,229,255,0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, w, h)
    const enc = Math.round(Math.min(1, t / 0.6) * 12)
    const esc = 0.85 + 0.15 * Math.min(1, t / 0.6)
    const s = 120 * esc
    ctx.save()
    ctx.translate(w / 2 - s / 2, 94 - s / 2)
    dibujarLogo(ctx, s, { encendidas: enc, luces: Math.round(Math.min(1, t / 0.6) * 8) })
    ctx.restore()
    const a = Math.max(0, Math.min(1, (t - 0.55) / 0.35))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.font = `28px ${FUENTE}`
    ctx.fillText(nombre, w / 2, 190 + (1 - a) * 10)
    ctx.fillStyle = `rgba(255,255,255,${0.65 * a})`
    ctx.font = `13px ${FUENTE_B}`
    ctx.fillText(sub, w / 2, 220)
}

// ---------------- Monitor de rendimiento (4 columnas verticales) ----------------
const COLS = [
    { k: 'cpu', titulo: 'CPU', icono: 'cpu' },
    { k: 'gpu', titulo: 'GPU', icono: 'gpu' },
    { k: 'ram', titulo: 'RAM', icono: 'database' },
    { k: 'disco', titulo: 'DISCO', icono: 'device-sd-card' },
]
function colorNivel(p) {
    if (p < 60) return ['#00e676', '#00b0ff']
    if (p < 85) return ['#ffea00', '#ff9100']
    return ['#ff5252', '#ff1744']
}
const gb = v => (v >= 100 ? v.toFixed(0) : v.toFixed(1))

export function pintarMonitor(ctx, w, h, d, historial, iconos) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    const cw = w / 4
    COLS.forEach((c, i) => {
        const x0 = i * cw
        const val = d ? d[c.k] : null
        const p = val == null ? 0 : Math.max(0, Math.min(100, val))
        // tarjeta
        rr(ctx, x0 + 3, 3, cw - 6, h - 6, 12)
        ctx.fillStyle = '#111116'
        ctx.fill()
        // titulo con icono
        const ic = iconos?.get(`tabler:${c.icono}:#ffffff`)
        if (ic) ctx.drawImage(ic, x0 + 10, 11, 16, 16)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = `12px ${FUENTE}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(c.titulo, x0 + (ic ? 30 : 12), 19)
        // numero grande con su %
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.font = `26px ${FUENTE}`
        const num = val == null ? '--' : `${Math.round(p)}`
        const nw = ctx.measureText(num).width
        ctx.fillText(num, x0 + cw / 2 - 7, 50)
        ctx.font = `13px ${FUENTE}`
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.textAlign = 'left'
        ctx.fillText('%', x0 + cw / 2 - 7 + nw / 2 + 2, 54)
        ctx.textAlign = 'center'

        // barra vertical
        const bx = x0 + cw / 2 - 14, by = 70, bw = 28, bh = 136
        rr(ctx, bx, by, bw, bh, 8)
        ctx.fillStyle = '#23232b'
        ctx.fill()
        for (let t = 1; t < 4; t++) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx + 3, by + (bh * t) / 4, bw - 6, 1) }
        const fh = (bh * p) / 100
        if (fh > 1) {
            const [a, b] = colorNivel(p)
            const g = ctx.createLinearGradient(0, by + bh, 0, by)
            g.addColorStop(0, b)
            g.addColorStop(1, a)
            ctx.save()
            rr(ctx, bx, by, bw, bh, 8); ctx.clip()
            ctx.fillStyle = g
            ctx.fillRect(bx, by + bh - fh, bw, fh)
            ctx.restore()
        }
        // historial de los ultimos ~30 s, a lo ancho de la tarjeta
        const hs = historial?.[c.k] || []
        const gx = x0 + 10, gy = 214, gw = cw - 20, gh = 22
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(gx, gy, gw, gh)
        if (hs.length > 1) {
            const [a] = colorNivel(p)
            ctx.beginPath()
            hs.forEach((v, j) => {
                const xx = gx + (j / 29) * gw
                const yy = gy + gh - (gh * Math.max(0, Math.min(100, v))) / 100
                j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy)
            })
            ctx.strokeStyle = a
            ctx.globalAlpha = 0.8
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.globalAlpha = 1
        }
        // detalle abajo
        let det = ''
        if (d) {
            if (c.k === 'gpu' && d.gpuTemp != null) det = `${Math.round(d.gpuTemp)}°C`
            if (c.k === 'gpu' && d.gpuMemUsado != null && d.gpuMemTotal) det += (det ? ' · ' : '') + `${gb(d.gpuMemUsado / 1024)}G`
            if (c.k === 'ram' && d.ramUsado != null) det = `${gb(d.ramUsado)}/${gb(d.ramTotal)} GB`
            if (c.k === 'disco' && d.cLibre != null) det = `C: ${Math.round(d.cLibre)} GB libres`
            if (c.k === 'cpu' && d.cpuNucleos) det = `${d.cpuNucleos} hilos`
        }
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        let size = 11
        do { ctx.font = `${size}px ${FUENTE_B}`; size-- } while (ctx.measureText(det).width > cw - 10 && size > 7)
        ctx.fillText(det, x0 + cw / 2, h - 16)
    })
}

// ---------------- Visualizador de musica (fila de abajo de la pagina Musica) ----------------
// Portada en la tecla libre (90x90)
export function pintarPortada(ctx, w, h, portada, iconoMusica, sonando) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    rr(ctx, 3, 3, w - 6, h - 6, 14)
    ctx.save(); ctx.clip()
    if (portada) ctx.drawImage(portada, 3, 3, w - 6, h - 6)
    else {
        const g = ctx.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, '#7c4dff'); g.addColorStop(1, '#00e5ff')
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
        if (iconoMusica) ctx.drawImage(iconoMusica, (w - 44) / 2, (h - 44) / 2, 44, 44)
    }
    ctx.restore()
    if (sonando === false && portada) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, 3, 3, w - 6, h - 6, 14); ctx.fill() }
}

// Franja de texto arriba de las barras (360x26)
export function pintarTextoMusica(ctx, w, h, info) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const titulo = info?.titulo || (info?.sonando ? 'Sonando' : 'Nada sonando')
    const artista = info?.artista || info?.app || ''
    ctx.font = `14px ${FUENTE}`
    ctx.fillStyle = info?.sonando ? '#fff' : 'rgba(255,255,255,0.55)'
    const t = recortar(ctx, titulo, w * 0.62)
    ctx.fillText(t, 8, h / 2)
    const tw = ctx.measureText(t).width
    ctx.font = `12px ${FUENTE_B}`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    const pre = info && !info.sonando && info.titulo ? 'En pausa · ' : (artista ? '· ' : '')
    ctx.fillText(recortar(ctx, pre + artista, w - tw - 24), 8 + tw + 8, h / 2 + 1)
}

function recortar(ctx, t, max) {
    if (ctx.measureText(t).width <= max) return t
    while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
    return t + '…'
}

// barras: w=264,h=48
export function pintarBarras(ctx, w, h, niveles) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    const n = niveles.length
    const gap = 3
    const bw = (w - 8 - gap * (n - 1)) / n
    const g = ctx.createLinearGradient(0, h, 0, 0)
    g.addColorStop(0, '#00e5ff')
    g.addColorStop(0.5, '#7c4dff')
    g.addColorStop(1, '#ff4081')
    for (let i = 0; i < n; i++) {
        const v = Math.max(0.05, Math.min(1, niveles[i]))
        const bh = Math.max(4, v * (h - 4))
        const x = 4 + i * (bw + gap)
        ctx.fillStyle = g
        rr(ctx, x, h - bh, bw, bh, Math.min(3, bw / 2))
        ctx.fill()
        // punta brillante
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(x, h - bh, bw, 2)
    }
}

export class Ecualizador {
    constructor(n = 16) {
        this.n = n
        this.niveles = new Array(n).fill(0)
        this.fase = new Array(n).fill(0).map(() => Math.random() * Math.PI * 2)
        this.vel = new Array(n).fill(0).map((_, i) => 0.18 + (i % 5) * 0.05 + Math.random() * 0.08)
        this.pico = 0
    }
    paso(picoL, picoR, sonando) {
        const ahora = Date.now()
        if (Math.max(picoL, picoR) > 0.004) this.ultimaSenal = ahora
        // si algo suena aunque la app no lo reporte, tambien animamos
        const hayAudio = ahora - (this.ultimaSenal || 0) < 1500
        if (!sonando && hayAudio) sonando = true
        if (sonando && !hayAudio) {
            // Windows no da el nivel (pasa con algunas apps): animacion propia con ritmo
            this.t = (this.t || 0) + 1
            const golpe = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 0.35)) * (this.t % 8 < 2 ? 1 : 0.7)
            picoL = golpe * (0.8 + 0.2 * Math.random()); picoR = golpe * (0.8 + 0.2 * Math.random())
            this.ref = 1
        }
        // ganancia automatica: el medidor de Windows suele dar valores bajos (0.1-0.3),
        // asi que comparamos contra el maximo reciente para usar toda la altura
        const crudo = Math.max(picoL, picoR)
        this.ref = Math.max(crudo, (this.ref || 0.05) * 0.996, 0.03)
        picoL = Math.min(1, picoL / this.ref)
        picoR = Math.min(1, picoR / this.ref)
        const pico = sonando ? Math.max(picoL, picoR) : 0
        this.pico = this.pico * 0.6 + pico * 0.4
        for (let i = 0; i < this.n; i++) {
            this.fase[i] += this.vel[i]
            const lado = i < this.n / 2 ? picoL : picoR
            // forma tipo espectro: graves (izquierda) mas altos, agudos mas bajos
            const forma = 1 - (i / this.n) * 0.35
            const mov = 0.55 + 0.45 * Math.abs(Math.sin(this.fase[i]))
            const objetivo = sonando ? Math.max(0.18, Math.pow(Math.max(lado, this.pico * 0.85), 0.6) * forma * mov) : 0
            const actual = this.niveles[i]
            this.niveles[i] = objetivo > actual ? actual + (objetivo - actual) * 0.7 : actual * 0.82
        }
        return this.niveles
    }
}

// ---------------- Mezclador de volumen ----------------
// Un canal ocupa media fila (180x90) = 2 teclas. Cada tecla se dibuja por separado para que el marco
// fisico entre teclas no corte nada: la de afuera (junto a la perilla) = icono + nombre,
// la de adentro = porcentaje + barra.
export function pintarCanal(ctx, w, h, app, lado, icono, iconosTabler) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    const izq = lado === 'izq'
    const xIcono = izq ? 0 : 90, xVol = izq ? 90 : 0
    const tarjeta = (x, borde) => {
        rr(ctx, x + 4, 4, 82, 82, 12)
        const f = ctx.createLinearGradient(0, 0, 0, h)
        f.addColorStop(0, app?.clave === 'general' ? '#1f3350' : '#22222c')
        f.addColorStop(1, app?.clave === 'general' ? '#142238' : '#15151c')
        ctx.fillStyle = f
        ctx.fill()
        if (borde) { ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke() }
    }
    if (!app) {
        for (const x of [0, 90]) { rr(ctx, x + 4, 4, 82, 82, 12); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke() }
        return
    }
    const sonando = app.activo && !app.mute
    tarjeta(xIcono, sonando)
    tarjeta(xVol, sonando)

    // --- tecla de afuera: icono + nombre ---
    const img = icono || (app.clave === 'general' ? iconosTabler?.get('tabler:volume:#ffffff') : iconosTabler?.get('tabler:app-window:#ffffff'))
    const ix = xIcono + 25, iy = 11
    if (img) {
        ctx.globalAlpha = app.mute ? 0.4 : 1
        ctx.drawImage(img, ix, iy, 40, 40)
        ctx.globalAlpha = 1
    }
    if (app.mute) {
        const m = iconosTabler?.get('tabler:volume-3:#ffffff')
        ctx.beginPath(); ctx.arc(ix + 38, iy + 36, 10, 0, Math.PI * 2); ctx.fillStyle = '#e53935'; ctx.fill()
        if (m) ctx.drawImage(m, ix + 31, iy + 29, 14, 14)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = app.mute ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.9)'
    const nombre = app.nombre || app.clave
    let size = 12
    do { ctx.font = `${size}px ${FUENTE}`; size-- } while (ctx.measureText(nombre).width > 76 && size > 9)
    ctx.fillText(recortar(ctx, nombre, 76), xIcono + 45, 68)

    // --- tecla de adentro: porcentaje + barra ---
    ctx.fillStyle = app.mute ? 'rgba(255,255,255,0.5)' : '#fff'
    ctx.font = `${app.mute ? 18 : 24}px ${FUENTE}`
    ctx.fillText(app.mute ? 'Mudo' : `${app.vol}%`, xVol + 45, 36)
    const bx = xVol + 12, by = 60, bw = 66, bh = 9
    rr(ctx, bx, by, bw, bh, 4.5)
    ctx.fillStyle = '#33333f'
    ctx.fill()
    const fw = (bw * Math.max(0, Math.min(100, app.vol))) / 100
    if (fw > 1) {
        const g = ctx.createLinearGradient(bx, 0, bx + bw, 0)
        if (app.mute) { g.addColorStop(0, '#555'); g.addColorStop(1, '#777') }
        else { g.addColorStop(0, '#00e5ff'); g.addColorStop(1, app.vol > 85 ? '#ff4081' : '#7c4dff') }
        ctx.save(); rr(ctx, bx, by, bw, bh, 4.5); ctx.clip()
        ctx.fillStyle = g
        ctx.fillRect(bx, by, fw, bh)
        ctx.restore()
    }
}
