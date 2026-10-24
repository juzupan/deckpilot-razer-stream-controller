// Dibujo de teclas y pantallas laterales con iconos.
// Iconos de acciones: Tabler Icons (MIT), en la carpeta iconos/.
// Iconos de apps: el icono real del programa, sacado una vez y guardado en iconos/cache/.

import canvasPkg from 'canvas'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'

const { loadImage } = canvasPkg
const FUENTE = '"Segoe UI Semibold", "Segoe UI", Arial, sans-serif'

const imagenes = new Map() // clave -> Image

// "bulb" -> icono Tabler en blanco, renderizado grande para que quede nitido
async function cargarTabler(dir, nombre, color = '#ffffff') {
    const clave = `tabler:${nombre}:${color}`
    if (imagenes.has(clave)) return
    const ruta = join(dir, 'iconos', `${nombre}.svg`)
    if (!existsSync(ruta)) return
    const svg = readFileSync(ruta, 'utf8')
        .replace(/currentColor/g, color)
        .replace(/width="24"/, 'width="192"').replace(/height="24"/, 'height="192"')
    try { imagenes.set(clave, await loadImage(Buffer.from(svg))) } catch { }
}

function claveApp(ruta) { return 'app:' + createHash('md5').update(ruta.toLowerCase()).digest('hex').slice(0, 12) }

// Saca los iconos reales de los programas que falten en la cache (solo la primera vez)
function extraerIconosApps(dir, rutas, log) {
    const cache = join(dir, 'iconos', 'cache')
    mkdirSync(cache, { recursive: true })
    const faltan = rutas
        .filter(r => !r.toLowerCase().startsWith('shell:'))
        .map(r => ({ ruta: r, salida: join(cache, claveApp(r).slice(4) + '.png') }))
        .filter(x => !existsSync(x.salida))
    if (faltan.length && process.platform === 'win32') {
        const lista = join(cache, '_pendientes.json')
        writeFileSync(lista, JSON.stringify(faltan), 'utf8')
        log?.(`Sacando ${faltan.length} iconos de tus programas...`)
        const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'helpers', 'iconos.ps1'), lista], { encoding: 'utf8', windowsHide: true, timeout: 60000 })
        for (const l of String(r.stdout || '').split(/\r?\n/)) if (l.trim() && !l.startsWith('ok:')) log?.(l.trim())
    }
    return cache
}

function iconoDe(tecla) {
    if (!tecla) return null
    if (tecla.icono && tecla.icono !== 'app') return { tipo: 'tabler', nombre: tecla.icono }
    if (tecla.accion?.tipo === 'abrir' && !tecla.accion.ruta.toLowerCase().startsWith('shell:')) return { tipo: 'app', ruta: tecla.icono_de || tecla.accion.ruta }
    return tecla.icono_respaldo ? { tipo: 'tabler', nombre: tecla.icono_respaldo } : null
}

export async function cargarIconos(dir, config, log) {
    const todas = []
    for (const p of Object.values(config.perfiles)) for (const pg of p.paginas) for (const t of pg.teclas) if (t) todas.push(t)
    const rutasApps = [...new Set(todas.map(iconoDe).filter(i => i?.tipo === 'app').map(i => i.ruta))]
    const cache = extraerIconosApps(dir, rutasApps, log)
    for (const r of rutasApps) {
        const png = join(cache, claveApp(r).slice(4) + '.png')
        if (existsSync(png)) { try { imagenes.set(claveApp(r), await loadImage(png)) } catch { } }
    }
    const nombres = new Set(['app-window', 'cpu', 'gpu', 'database', 'device-sd-card', 'music', 'activity', 'volume', 'volume-3', 'home', 'adjustments-horizontal'])
    for (const t of todas) { const i = iconoDe(t); if (i?.tipo === 'tabler') nombres.add(i.nombre); if (t.icono_respaldo) nombres.add(t.icono_respaldo) }
    for (const pk of [config.perillas, ...Object.values(config.perfiles).map(p => p.perillas)]) for (const k of Object.values(pk || {})) if (k?.icono) nombres.add(k.icono)
    for (const n of nombres) await cargarTabler(dir, n)
}

function imagenDe(tecla) {
    const i = iconoDe(tecla)
    if (i?.tipo === 'app') return imagenes.get(claveApp(i.ruta)) || imagenes.get('tabler:app-window:#ffffff')
    if (i?.tipo === 'tabler') return imagenes.get(`tabler:${i.nombre}:#ffffff`)
    return null
}

function rgb(hex) {
    const n = parseInt(String(hex || '#333333').replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const aclarar = (hex, f) => { const [r, g, b] = rgb(hex); return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})` }
const mezclar = (hex, f) => { const [r, g, b] = rgb(hex); return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})` }

function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

export function pintarTecla(ctx, w, h, tecla, presionada = false, opciones = {}) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    if (!tecla) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const esApp = iconoDe(tecla)?.tipo === 'app'
    // apps: fondo oscuro tenido con su color, para que resalte su icono real
    const base = tecla.color || '#5e5ce6'
    const g = ctx.createLinearGradient(0, 0, 0, h)
    if (esApp) {
        g.addColorStop(0, presionada ? mezclar(base, 0.9) : mezclar(base, 0.55))
        g.addColorStop(1, presionada ? mezclar(base, 0.6) : mezclar(base, 0.28))
    } else {
        // colores vivos: arriba mas claro, abajo casi el color puro
        g.addColorStop(0, presionada ? aclarar(base, 0.45) : aclarar(base, 0.18))
        g.addColorStop(1, presionada ? aclarar(base, 0.2) : mezclar(base, 0.92))
    }
    rectRedondo(ctx, 3, 3, w - 6, h - 6, 14)
    ctx.fillStyle = g
    ctx.fill()
    // brillo de vidrio en la parte de arriba
    const brillo = ctx.createLinearGradient(0, 3, 0, h * 0.5)
    brillo.addColorStop(0, 'rgba(255,255,255,0.22)')
    brillo.addColorStop(1, 'rgba(255,255,255,0)')
    rectRedondo(ctx, 3, 3, w - 6, h * 0.5, 14)
    ctx.fillStyle = brillo
    ctx.fill()
    rectRedondo(ctx, 3, 3, w - 6, h - 6, 14)
    ctx.strokeStyle = presionada ? '#ffffff' : 'rgba(255,255,255,0.10)'
    ctx.lineWidth = presionada ? 3 : 1
    ctx.stroke()

    const conTexto = opciones.etiquetas !== false && tecla.texto
    const img = imagenDe(tecla)
    if (img) {
        const tam = conTexto ? (esApp ? 50 : 44) : (esApp ? 64 : 58)
        const y = conTexto ? 10 : (h - tam) / 2
        if (!esApp) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1 }
        ctx.drawImage(img, (w - tam) / 2, y, tam, tam)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
        if (tecla.insignia) dibujarInsignia(ctx, w, tecla.insignia)
        if (conTexto) {
            ctx.fillStyle = 'rgba(255,255,255,0.92)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'alphabetic'
            let size = 12
            const txt = String(tecla.texto).replace(/\n/g, ' ')
            do { ctx.font = `${size}px ${FUENTE}`; size-- } while (ctx.measureText(txt).width > w - 12 && size > 8)
            ctx.fillText(txt, w / 2, h - 11)
        }
        return
    }

    // sin icono: solo texto
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineas = String(tecla.texto || '').split('\n')
    let size = 17
    do { ctx.font = `${size}px ${FUENTE}`; size-- } while (lineas.some(l => ctx.measureText(l).width > w - 14) && size > 9)
    const alto = size * 1.3
    lineas.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 - ((lineas.length - 1) * alto) / 2 + i * alto))
}

function dibujarInsignia(ctx, w, texto) {
    ctx.font = `bold 11px ${FUENTE}`
    const tw = Math.max(20, ctx.measureText(texto).width + 10)
    rectRedondo(ctx, w - tw - 6, 6, tw, 17, 8.5)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(texto, w - tw / 2 - 6, 15)
}

// Pantallas de los lados: una celda por perilla (arriba, centro, abajo)
export function pintarLateral(ctx, w, h, perillas) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    perillas.forEach((p, i) => {
        if (!p) return
        const cy = (h / 3) * i
        const img = p.icono ? imagenes.get(`tabler:${p.icono}:#ffffff`) : null
        if (img) ctx.drawImage(img, (w - 28) / 2, cy + 18, 28, 28)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        let size = 11
        do { ctx.font = `${size}px ${FUENTE}`; size-- } while (ctx.measureText(p.nombre || '').width > w - 4 && size > 7)
        ctx.fillText(p.nombre || '', w / 2, cy + (img ? 60 : 45))
    })
}

// donde queda guardado el icono real de un programa (lo usa el editor para mostrarlo)
export function archivoIconoApp(dir, ruta) { return join(dir, 'iconos', 'cache', claveApp(ruta).slice(4) + '.png') }

// para los paneles especiales (monitor, musica)
export const iconosCargados = imagenes

// Icono real de un .exe cualquiera (para el mezclador). Asincrono: no frena el controlador.
const pidiendo = new Map()
export function iconoDeRuta(dir, ruta) {
    if (!ruta) return Promise.resolve(null)
    const clave = claveApp(ruta)
    if (imagenes.has(clave)) return Promise.resolve(imagenes.get(clave))
    if (pidiendo.has(clave)) return pidiendo.get(clave)
    const cache = join(dir, 'iconos', 'cache')
    mkdirSync(cache, { recursive: true })
    const png = join(cache, clave.slice(4) + '.png')
    const p = (async () => {
        if (!existsSync(png) && process.platform === 'win32') {
            const lista = join(cache, `_mix_${clave.slice(4)}.json`)
            writeFileSync(lista, JSON.stringify([{ ruta, salida: png }]), 'utf8')
            await new Promise(res => {
                const h = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'helpers', 'iconos.ps1'), lista], { windowsHide: true, stdio: 'ignore' })
                h.on('exit', res); h.on('error', res)
            })
        }
        if (!existsSync(png)) return null
        try { const img = await loadImage(png); imagenes.set(clave, img); return img } catch { return null }
    })()
    pidiendo.set(clave, p)
    return p
}
