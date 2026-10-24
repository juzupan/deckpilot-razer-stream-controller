// DeckPilot: programa propio para el Razer Stream Controller, sin Loupedeck.
// - Las 12 teclas tactiles muestran la pagina actual del perfil.
// - Botones redondos: 1 = Home, 2 a 6 = paginas del perfil, 7 = mezclador (volumen por app), 8 = monitor.
// - El perfil cambia solo segun el programa en primer plano (config.json -> "reglas").
// - En la pagina de Musica, la fila de abajo muestra lo que suena con barras animadas.
// - Las teclas se mantienen presionadas "mantenerTeclaMs" para que los juegos las lean.
// - Editor visual en http://127.0.0.1:4747 (o mantener presionado el boton Home 1.5 s).

import * as LD from 'loupedeck'
import canvasPkg from 'canvas'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, copyFileSync } from 'node:fs'
import { iniciarEditor } from './editor-servidor.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTeclas, VK } from './teclas.js'
import { pintarTecla, pintarLateral, cargarIconos, iconosCargados, iconoDeRuta, archivoIconoApp } from './dibujo.js'
import { pintarSplash, pintarMonitor, pintarPortada, pintarTextoMusica, pintarBarras, Ecualizador, pintarCanal } from './paneles.js'

const { HAPTIC } = LD
const { loadImage } = canvasPkg
const AQUI = dirname(fileURLToPath(import.meta.url))
// "config" es siempre el mismo objeto: el editor lo reemplaza por dentro y todo lo ve al instante
// primera vez en una PC nueva: se parte del ejemplo (config.json es personal y no se comparte)
if (!existsSync(join(AQUI, 'config.json')) && existsSync(join(AQUI, 'config.ejemplo.json'))) copyFileSync(join(AQUI, 'config.ejemplo.json'), join(AQUI, 'config.json'))
const config = JSON.parse(readFileSync(join(AQUI, 'config.json'), 'utf8'))
let NOMBRE, HOLD, BOTON_HOME, BOTON_MEZCLA, BOTON_MONITOR
function derivar() {
    NOMBRE = config.nombre || 'DeckPilot'
    HOLD = Number(config.mantenerTeclaMs) || 90
    BOTON_HOME = config.botonHome ?? 0          // boton redondo 1: tu pagina principal
    BOTON_MEZCLA = config.botonMezclador ?? 6    // boton redondo 7: volumen por app
    BOTON_MONITOR = config.botonMonitor ?? 7     // boton redondo 8: rendimiento
}
derivar()
const PUERTO_EDITOR = Number(config.puertoEditor) || 4747
const PRIMER_BOTON_PAGINA = 1                      // botones 2 a 6: paginas del perfil

// tambien se guarda en deckpilot.log (se reinicia en cada arranque) para poder revisar errores
const ARCHIVO_LOG = join(AQUI, 'deckpilot.log')
try { writeFileSync(ARCHIVO_LOG, '') } catch { }
function log(...a) {
    const t = new Date().toLocaleTimeString()
    console.log(`[${t}]`, ...a)
    try { appendFileSync(ARCHIVO_LOG, `[${t}] ${a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`) } catch { }
}

// ---------- Ayudantes de Windows (PowerShell) ----------
function iniciarAyudante(nombre, alLinea, extra = []) {
    const ruta = join(AQUI, 'helpers', nombre)
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ruta, String(process.pid), ...extra], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    })
    p.on('error', e => log(`No pude iniciar ${nombre}:`, e.message))
    p.stdin.on('error', () => {})
    let buf = ''
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', d => {
        buf += d
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
            const linea = buf.slice(0, i).trim()
            buf = buf.slice(i + 1)
            if (linea) alLinea?.(linea)
        }
    })
    p.stderr.setEncoding('utf8')
    p.stderr.on('data', d => { const t = d.trim(); if (t) log(`(${nombre})`, t.split('\n')[0]) })
    p.on('exit', code => { if (!p.detenido) log(`Ayudante ${nombre} termino (codigo ${code})`) })
    p.detener = () => { p.detenido = true; try { p.kill() } catch { } }
    return p
}

const teclado = iniciarAyudante('teclado.ps1', linea => {
    if (linea !== 'listo') log('teclado:', linea)
})
function enviar(orden) {
    if (teclado.stdin.writable) teclado.stdin.write(orden + '\n')
}

// ---------- Estado ----------
let device = null
let conectado = false
let perfilActual = config.perfilPorDefecto || 'inicio'
let paginaActual = 0
let modo = 'paginas' // 'paginas' | 'monitor' | 'mezcla'
const teclasMantenidas = new Map() // tecla tactil -> lista de VK que estan abajo

function perfil() { return config.perfiles[perfilActual] || config.perfiles[config.perfilPorDefecto] }
// perillas comunes + las propias del perfil (las del perfil ganan)
function perillas() { return { ...(config.perillas || {}), ...(perfil().perillas || {}) } }
const OPC = { etiquetas: config.etiquetas !== false }

function pagina() { return perfil().paginas[paginaActual] || perfil().paginas[0] }
function maxPaginas() { return Math.min(perfil().paginas.length, BOTON_MEZCLA - PRIMER_BOTON_PAGINA) }

// ---------- Acciones ----------
function expandir(r) { return r.replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`) }

function abrir(ruta, args = '', cwd) {
    const r = expandir(ruta)
    if (r.toLowerCase().startsWith('shell:')) {
        spawn('explorer.exe', [r], { detached: true, stdio: 'ignore' }).unref()
        return
    }
    if (!r.toLowerCase().endsWith('.url') && !existsSync(r)) {
        log('No encuentro:', r)
        device?.vibrate(HAPTIC.REV_SLOW).catch(() => {})
        return
    }
    const opciones = { detached: true, stdio: 'ignore', cwd: cwd || dirname(r), windowsHide: true }
    // "start" de cmd abre .exe, .url, carpetas y accesos directos igual que doble clic
    spawn('cmd.exe', ['/c', 'start', '""', `"${r}"`, ...(args ? [args] : [])], { ...opciones, windowsVerbatimArguments: true }).unref()
}

const MEDIA = { PlayPause: VK.MEDIA_PLAY_PAUSE, Next: VK.MEDIA_NEXT, Prev: VK.MEDIA_PREV, Mute: VK.VOLUME_MUTE, VolUp: VK.VOLUME_UP, VolDown: VK.VOLUME_DOWN }

function ejecutar(accion, fase, teclaId) {
    if (!accion) return
    switch (accion.tipo) {
        case 'tecla': {
            const vks = parseTeclas(accion.teclas)
            if (!vks) { log('Tecla no reconocida:', accion.teclas); return }
            if (accion.modo === 'mantener') {
                if (fase === 'down') { enviar(`down ${vks.join(',')}`); teclasMantenidas.set(teclaId, vks) }
                if (fase === 'up' && teclasMantenidas.has(teclaId)) { enviar(`up ${teclasMantenidas.get(teclaId).join(',')}`); teclasMantenidas.delete(teclaId) }
            } else if (fase === 'down') {
                enviar(`press ${accion.mantenerMs ?? HOLD} ${vks.join(',')}`)
            }
            break
        }
        case 'ciclo':
            // toca una vez: empieza a repetir la tecla sola; toca otra vez: se detiene
            if (fase === 'down') alternarCiclo(accion, teclaId)
            break
        case 'escribir':
            if (fase === 'down') enviar(`type ${Buffer.from(String(accion.texto), 'utf8').toString('base64')}`)
            break
        case 'media':
            if (fase === 'down' && MEDIA[accion.tecla]) enviar(`press 0 ${MEDIA[accion.tecla]}`)
            break
        case 'abrir':
            if (fase === 'down') abrir(accion.ruta, accion.args)
            break
        case 'sonido':
            if (fase === 'down') enviar(`sound ${accion.archivo}`)
            break
        case 'volverALoupedeck':
            if (fase === 'down') volverALoupedeck()
            break
        case 'editor':
            if (fase === 'down') abrirEditor()
            break
        default:
            log('Accion desconocida:', accion.tipo)
    }
}

// ---------- Ciclos automaticos (ej. flash de luces) ----------
const ciclos = new Map() // "perfil|pagina|tecla" -> timer
function claveCiclo(teclaId) { return `${perfilActual}|${paginaActual}|${teclaId}` }
function cicloActivo(teclaId) { return ciclos.has(claveCiclo(teclaId)) }
function alternarCiclo(accion, teclaId) {
    const k = claveCiclo(teclaId)
    if (ciclos.has(k)) { clearInterval(ciclos.get(k)); ciclos.delete(k); log('Ciclo detenido:', accion.teclas); return }
    const vks = parseTeclas(accion.teclas)
    if (!vks) return
    const tick = () => enviar(`press ${accion.mantenerMs ?? 150} ${vks.join(',')}`)
    tick()
    ciclos.set(k, setInterval(tick, Math.max(150, accion.intervaloMs ?? 400)))
    log('Ciclo activo:', accion.teclas)
}
function detenerCiclos() { for (const t of ciclos.values()) clearInterval(t); ciclos.clear() }

function volverALoupedeck() {
    log('Volviendo a Loupedeck...')
    const exe = 'C:\\Program Files (x86)\\Loupedeck\\Loupedeck2\\configui2\\Loupedeck.exe'
    salir().then(() => {
        if (existsSync(exe)) spawn('cmd.exe', ['/c', 'start', '""', `"${exe}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref()
        setTimeout(() => process.exit(0), 500)
    })
}

// ---------- Dibujo ----------
let dibujando = Promise.resolve()
function enCola(fn) { dibujando = dibujando.then(fn).catch(() => {}); return dibujando }

function dibujarTodo() {
    return enCola(async () => {
        if (!device || !conectado) return
        if (modo === 'monitor') {
            await pintarPantallaMonitor()
        } else if (modo === 'mezcla') {
            await pintarMezclador()
        } else {
            const p = pagina()
            for (let i = 0; i < 12; i++) {
                if (p.visualizador && i >= 7) continue // tecla 8 = portada, fila de abajo = barras
                await device.drawKey(i, (ctx, w, h) => pintarTecla(ctx, w, h, p.teclas[i], cicloActivo(i), OPC)).catch(() => {})
            }
            if (p.visualizador) await pintarMusicaCompleta()
        }
        const per = modo === 'mezcla' ? perillasMezcla() : perillas()
        await device.drawScreen('left', (ctx, w, h) => pintarLateral(ctx, w, h, ['knobTL', 'knobCL', 'knobBL'].map(k => per[k]))).catch(() => {})
        await device.drawScreen('right', (ctx, w, h) => pintarLateral(ctx, w, h, ['knobTR', 'knobCR', 'knobBR'].map(k => per[k]))).catch(() => {})
        await pintarBotones()
    }).then(actualizarAyudantes)
}

async function pintarBotones() {
    const paginas = perfil().paginas
    for (let b = 0; b < 8; b++) {
        let color = '#000000'
        const enInicio = modo === 'paginas' && perfilActual === config.perfilPorDefecto && paginaActual === 0
        const ip = b - PRIMER_BOTON_PAGINA
        if (b === BOTON_HOME) {
            const regreso = antesDeHome && modo === 'paginas' && perfilActual === config.perfilPorDefecto
            color = regreso ? (config.perfiles[antesDeHome.perfil]?.paginas[0]?.color || '#ffffff') : enInicio ? '#ffffff' : '#2a2a2a'
        }
        else if (b === BOTON_MONITOR) color = modo === 'monitor' ? '#00e5ff' : '#0a2a30'
        else if (b === BOTON_MEZCLA) color = modo === 'mezcla' ? '#00e676' : '#0a2a12'
        else if (ip >= 0 && ip < maxPaginas()) color = modo === 'paginas' && ip === paginaActual ? paginas[ip].color : atenuar(paginas[ip].color)
        await device.setButtonColor({ id: b, color }).catch(() => {})
    }
}

function atenuar(hex) {
    const n = parseInt(hex.replace('#', ''), 16)
    const f = c => Math.round(c * 0.12).toString(16).padStart(2, '0')
    return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255)
}

// Home es ida y vuelta: 1er toque = Inicio (recordando donde estabas), 2do toque = regresas a la app
let antesDeHome = null // { perfil, pagina }
function alternarHome() {
    const enHome = modo === 'paginas' && perfilActual === config.perfilPorDefecto
    if (enHome && antesDeHome && config.perfiles[antesDeHome.perfil]) {
        detenerCiclos()
        perfilActual = antesDeHome.perfil
        paginaActual = Math.min(antesDeHome.pagina, perfil().paginas.length - 1)
        antesDeHome = null
        log(`Home: de vuelta a ${perfilActual}`)
    } else {
        if (perfilActual !== config.perfilPorDefecto) { antesDeHome = { perfil: perfilActual, pagina: paginaActual }; detenerCiclos() }
        modo = 'paginas'
        perfilActual = config.perfilPorDefecto
        paginaActual = 0
        log('Home')
    }
}

async function cambiarPerfil(nombre, motivo) {
    antesDeHome = null // cambiaste de ventana: ya no hay a donde "regresar"
    if (!config.perfiles[nombre] || nombre === perfilActual) return
    detenerCiclos()
    perfilActual = nombre
    paginaActual = 0
    log(`Perfil: ${nombre} (${motivo})`)
    await dibujarTodo()
}

// ---------- Monitor de rendimiento ----------
let monitor = null
let datosMonitor = null
const historial = { cpu: [], gpu: [], ram: [], disco: [] }

function iniciarMonitor() {
    if (monitor) return
    monitor = iniciarAyudante('monitor.ps1', linea => {
        try { datosMonitor = JSON.parse(linea) } catch { return }
        for (const k of Object.keys(historial)) {
            historial[k].push(datosMonitor[k] ?? 0)
            if (historial[k].length > 30) historial[k].shift()
        }
        if (modo === 'monitor') enCola(pintarPantallaMonitor)
    })
}
function detenerMonitor() { monitor?.detener(); monitor = null }

async function pintarPantallaMonitor() {
    if (!device || !conectado || modo !== 'monitor') return
    await device.drawScreen('center', (ctx, w, h) => pintarMonitor(ctx, w, h, datosMonitor, historial, iconosCargados)).catch(() => {})
}

// ---------- Musica: portada, titulo y barras ----------
let media = null
let infoMusica = null
let portada = null
const picos = { l: 0, r: 0 }
const eq = new Ecualizador(24)
let timerBarras = null
let enviandoBarras = false

function paginaConMusica() { return modo === 'paginas' && pagina()?.visualizador }

function iniciarMedia() {
    if (media) return
    const dir = join(AQUI, 'iconos', 'cache')
    mkdirSync(dir, { recursive: true })
    media = iniciarAyudante('media.ps1', async linea => {
        if (linea.startsWith('p ')) {
            const [, l, r] = linea.split(' ')
            picos.l = Number(l) || 0; picos.r = Number(r) || 0
        } else if (linea.startsWith('m ')) {
            try {
                const nueva = JSON.parse(linea.slice(2))
                const cambioPortada = nueva.portada !== infoMusica?.portada
                infoMusica = nueva
                if (cambioPortada) portada = nueva.portada ? await loadImage(nueva.portada).catch(() => null) : null
                if (paginaConMusica()) enCola(pintarMusicaCompleta)
            } catch { }
        } else if (linea.startsWith('e ')) log(linea.slice(2))
    }, [dir])
    timerBarras = setInterval(frameBarras, 120)
}
function detenerMedia() {
    media?.detener(); media = null
    clearInterval(timerBarras); timerBarras = null
}

// Pagina Musica: portada en la tecla 8 (fila 2, ultima), nombre y barras en toda la fila de abajo
const BARRAS = { x: 0, y: 206, w: 360, h: 64 }
async function pintarMusicaCompleta() {
    if (!device || !conectado || !paginaConMusica()) return
    await device.drawKey(7, (ctx, w, h) => pintarPortada(ctx, w, h, portada, iconosCargados.get('tabler:music:#ffffff'), infoMusica?.sonando)).catch(() => {})
    await device.drawCanvas({ id: 'center', x: 0, y: 180, width: 360, height: 26 }, (ctx, w, h) => pintarTextoMusica(ctx, w, h, infoMusica)).catch(() => {})
    await device.drawCanvas({ id: 'center', x: BARRAS.x, y: BARRAS.y, width: BARRAS.w, height: BARRAS.h }, (ctx, w, h) => pintarBarras(ctx, w, h, eq.niveles)).catch(() => {})
}

function frameBarras() {
    if (!device || !conectado || !paginaConMusica() || enviandoBarras) return
    const niveles = eq.paso(picos.l, picos.r, !!infoMusica?.sonando)
    // si no suena nada y las barras ya bajaron, no gastamos USB
    const quieto = Math.max(...niveles) < 0.01
    if (quieto && eq.quieto) return
    eq.quieto = quieto
    enviandoBarras = true
    device.drawCanvas({ id: 'center', x: BARRAS.x, y: BARRAS.y, width: BARRAS.w, height: BARRAS.h }, (ctx, w, h) => pintarBarras(ctx, w, h, niveles))
        .catch(() => {}).finally(() => { enviandoBarras = false })
}

// ---------- Mezclador: volumen por app ----------
// 6 canales = 6 perillas. Canal 0 (perilla arriba-izquierda) es el volumen General.
const PERILLAS_CANAL = ['knobTL', 'knobCL', 'knobBL', 'knobTR', 'knobCR', 'knobBR']
let PASO_VOLUMEN = Number(config.pasoVolumen) || 2
let mezclador = null
let canales = new Array(6).fill(null) // apps visibles, en orden de perilla
let todasLasApps = []
let errorMezclador = null

function iniciarMezclador() {
    if (mezclador) return
    canales = new Array(6).fill(null)
    mezclador = iniciarAyudante('mezclador.ps1', linea => {
        if (linea.startsWith('e ')) { log('mezclador:', linea.slice(2)); errorMezclador = linea.slice(2); if (modo === 'mezcla') enCola(pintarMezclador); return }
        errorMezclador = null
        if (!linea.startsWith('l ')) return
        try { todasLasApps = JSON.parse(linea.slice(2)) } catch { return }
        asignarCanales()
        if (modo === 'mezcla') enCola(pintarMezclador)
    })
}
function detenerMezclador() { mezclador?.detener(); mezclador = null }

// mantiene cada app en su perilla mientras siga abierta; las nuevas ocupan huecos (primero las que suenan)
function asignarCanales() {
    const porClave = new Map(todasLasApps.map(a => [a.clave, a]))
    // conserva el icono y, si acabas de mover la perilla, tu valor (Windows tarda un instante en reportarlo)
    const fusionar = (viejo, nuevo) => {
        const r = { ...nuevo, _icono: viejo?._icono, _t: viejo?._t }
        if (viejo && Date.now() - (viejo._t || 0) < 1200) { r.vol = viejo.vol; r.mute = viejo.mute }
        return r
    }
    canales = canales.map(c => (c && porClave.has(c.clave) ? fusionar(c, porClave.get(c.clave)) : null))
    if (porClave.get('general')) canales[0] = fusionar(canales[0], porClave.get('general'))
    const usadas = new Set(canales.filter(Boolean).map(c => c.clave))
    const candidatas = todasLasApps.filter(a => !usadas.has(a.clave) && a.clave !== 'general')
        .sort((a, b) => (b.activo - a.activo))
    for (let i = 1; i < 6 && candidatas.length; i++) if (!canales[i]) canales[i] = { ...candidatas.shift() }
    for (const c of canales) if (c?.ruta) iconoDeRuta(AQUI, c.ruta).then(img => { if (img && !c._icono) { c._icono = img; if (modo === 'mezcla') enCola(pintarMezclador) } })
}

function canalDePerilla(id) { const i = PERILLAS_CANAL.indexOf(id); return i >= 0 ? canales[i] : null }

function enviarMezclador(orden) { if (mezclador?.stdin.writable) mezclador.stdin.write(orden + '\n') }

let timerVolumen = null
function moverVolumen(c, delta) {
    c.vol = Math.max(0, Math.min(100, c.vol + delta * PASO_VOLUMEN))
    c._t = Date.now()
    if (c.mute && delta > 0) { c.mute = false; enviarMezclador(`mute ${encodeURIComponent(c.clave)} 0`) }
    pintarCanalDe(c)
    // agrupa giros rapidos en una sola orden
    clearTimeout(timerVolumen)
    timerVolumen = setTimeout(() => enviarMezclador(`vol ${encodeURIComponent(c.clave)} ${c.vol}`), 40)
}
function silenciar(c) {
    c.mute = !c.mute
    c._t = Date.now()
    enviarMezclador(`mute ${encodeURIComponent(c.clave)} ${c.mute ? 1 : 0}`)
    pintarCanalDe(c)
}

function iconoCanal(c) {
    if (!c) return null
    if (c._icono) return c._icono
    return null
}
function pintarCanalDe(c) {
    const i = canales.indexOf(c)
    if (i < 0 || !device || !conectado || modo !== 'mezcla') return
    const der = i >= 3, fila = i % 3
    enCola(() => device.drawCanvas({ id: 'center', x: der ? 180 : 0, y: fila * 90, width: 180, height: 90 },
        (ctx, w, h) => pintarCanal(ctx, w, h, c, der ? 'der' : 'izq', iconoCanal(c), iconosCargados)).catch(() => {}))
    enCola(() => pintarLateralesMezcla())
}

async function pintarMezclador() {
    if (!device || !conectado || modo !== 'mezcla') return
    await device.drawScreen('center', (ctx, w, h) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
        if (!canales.some(Boolean)) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.font = '16px "Segoe UI", Arial, sans-serif'
            ctx.fillText(errorMezclador ? 'No pude leer el audio de Windows' : 'Buscando apps con sonido...', w / 2, h / 2 - 8)
            ctx.font = '12px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
            ctx.fillText(errorMezclador ? 'Detalle en deckpilot.log' : 'Pon algo a sonar', w / 2, h / 2 + 16)
            return
        }
        canales.forEach((c, i) => {
            const der = i >= 3, fila = i % 3
            ctx.save(); ctx.translate(der ? 180 : 0, fila * 90)
            pintarCanal(ctx, 180, 90, c, der ? 'der' : 'izq', iconoCanal(c), iconosCargados)
            ctx.restore()
        })
    }).catch(() => {})
    await pintarLateralesMezcla()
}

function perillasMezcla() {
    const o = {}
    PERILLAS_CANAL.forEach((k, i) => { const c = canales[i]; if (c) o[k] = { nombre: c.mute ? 'Mudo' : `${c.vol}%`, icono: i === 0 ? 'volume' : null } })
    return o
}
async function pintarLateralesMezcla() {
    if (!device || !conectado || modo !== 'mezcla') return
    const per = perillasMezcla()
    await device.drawScreen('left', (ctx, w, h) => pintarLateral(ctx, w, h, ['knobTL', 'knobCL', 'knobBL'].map(k => per[k]))).catch(() => {})
    await device.drawScreen('right', (ctx, w, h) => pintarLateral(ctx, w, h, ['knobTR', 'knobCR', 'knobBR'].map(k => per[k]))).catch(() => {})
}

// arranca/detiene los ayudantes segun lo que se ve en pantalla
function actualizarAyudantes() {
    if (modo === 'monitor') iniciarMonitor(); else detenerMonitor()
    if (modo === 'mezcla') iniciarMezclador(); else detenerMezclador()
    if (paginaConMusica()) iniciarMedia(); else detenerMedia()
}

// ---------- Programa en primer plano ----------
let IGNORAR = new Set((config.ignorar || ['escritorio']).map(s => s.toLowerCase()))
// programas que usaste hace poco (el editor los ofrece para asignarlos a un perfil)
const recientes = new Map() // proceso -> hora
function reglaPara(proceso) {
    return (config.reglas || []).find(r => (r.procesos || [r.proceso]).some(p => String(p).toLowerCase() === proceso))
}

iniciarAyudante('ventana.ps1', proceso => {
    recientes.delete(proceso); recientes.set(proceso, Date.now())
    if (recientes.size > 25) recientes.delete(recientes.keys().next().value)
    if (IGNORAR.has(proceso)) return // escritorio, menu inicio... no cambian nada
    const regla = reglaPara(proceso)
    if (regla) cambiarPerfil(regla.perfil, `abriste ${proceso}`)
    else cambiarPerfil(config.perfilPorDefecto, `cambiaste a ${proceso}`)
})

// ---------- Dispositivo ----------
let intentos = 0
const esperar = ms => new Promise(r => setTimeout(r, ms))

async function conectar() {
    intentos++
    let lista = []
    try {
        lista = await LD.LoupedeckDevice.list({ ignoreWebsocket: true })
    } catch (e) {
        log('No pude listar los puertos USB:', e.message)
    }
    const info = lista.find(d => d.productId === LD.RazerStreamController.productId) ||
        lista.find(d => Object.values(LD).some(c => c?.productId === d.productId))
    if (!info) {
        if (intentos === 1 || intentos % 10 === 0) log('No encuentro el controlador. Esta conectado por USB?', lista.length ? `(vi: ${lista.map(d => d.path).join(', ')})` : '')
        setTimeout(conectar, 3000)
        return
    }
    const Clase = Object.values(LD).find(c => c?.productId === info.productId)
    if (intentos === 1) log(`Encontre ${Clase.name} en ${info.path}, conectando...`)

    device = new Clase({ path: info.path, autoConnect: false })
    registrarEventos(device)

    // La libreria espera para siempre si el controlador no contesta el saludo inicial
    // (pasa cuando Loupedeck se cerro de golpe). Le ponemos limite y lo "despertamos".
    const ok = await Promise.race([
        device.connect().then(() => true, e => { log('Error al conectar:', e?.message || e); return false }),
        esperar(6000).then(() => false),
    ])
    if (ok) { intentos = 0; return }

    log(`El controlador no contesto (intento ${intentos}). Reiniciando la conexion...`)
    try {
        const sp = device.connection?.connection
        if (sp?.isOpen) {
            sp.write(Buffer.from([0x88, 0x80, 0x00, 0x00, 0x00, 0x00])) // "cerrar sesion" por si quedo abierta
            await esperar(300)
            await new Promise(r => sp.close(() => r()))
        }
    } catch { }
    device.removeAllListeners()
    device = null
    if (intentos === 3) log(`>>> Si sigue sin conectar: desconecta el cable USB del controlador, espera 5 segundos y vuelve a conectarlo. ${NOMBRE} lo tomara solo.`)
    setTimeout(conectar, 2000)
}

let timerHome = null
function registrarEventos(device) {
    device.on('connect', async ({ address }) => {
        conectado = true
        log(`Conectado: ${device.type} en ${address}`)
        await device.setBrightness(Number(config.brillo) || 0.8).catch(() => {})
        // pantalla de bienvenida
        await device.drawScreen('left', ctx => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 60, 270) }).catch(() => {})
        await device.drawScreen('right', ctx => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 60, 270) }).catch(() => {})
        await animacionInicio()
        await dibujarTodo()
    })
    device.on('disconnect', err => { conectado = false; log('Controlador desconectado', err ? err.message : '') })

    device.on('down', async ({ id }) => {
        if (typeof id === 'number') {
            if (id === BOTON_MONITOR) {
                modo = modo === 'monitor' ? 'paginas' : 'monitor'
                log(modo === 'monitor' ? 'Monitor de rendimiento' : `Pagina: ${pagina().nombre}`)
            } else if (id === BOTON_MEZCLA) {
                modo = modo === 'mezcla' ? 'paginas' : 'mezcla'
                log(modo === 'mezcla' ? 'Mezclador de volumen' : `Pagina: ${pagina().nombre}`)
            } else if (id === BOTON_HOME) {
                // mantener presionado 1.5 s = abrir el editor visual
                clearTimeout(timerHome)
                timerHome = setTimeout(() => { device.vibrate(HAPTIC.LONG ?? HAPTIC.SHORT).catch(() => {}); abrirEditor() }, 1500)
                alternarHome()
            } else if (id - PRIMER_BOTON_PAGINA >= 0 && id - PRIMER_BOTON_PAGINA < maxPaginas()) {
                modo = 'paginas'
                paginaActual = id - PRIMER_BOTON_PAGINA
            } else return
            await dibujarTodo()
            return
        }
        if (modo === 'mezcla') { const c = canalDePerilla(id); if (c) silenciar(c); return }
        const k = perillas()[id]
        if (k?.presionar) ejecutar(k.presionar, 'down')
    })

    device.on('up', ({ id }) => { if (id === BOTON_HOME) clearTimeout(timerHome) })

    device.on('rotate', ({ id, delta }) => {
        if (modo === 'mezcla') { const c = canalDePerilla(id); if (c) moverVolumen(c, delta); return }
        const k = perillas()[id]
        if (!k) return
        if (k.girar === 'volumen') enviar(`press 0 ${delta > 0 ? VK.VOLUME_UP : VK.VOLUME_DOWN}`)
        else if (k.girar === 'pistas') enviar(`press 0 ${delta > 0 ? VK.MEDIA_NEXT : VK.MEDIA_PREV}`)
        else if (k.girar === 'brillo') {
            config.brillo = Math.min(1, Math.max(0.1, (Number(config.brillo) || 0.8) + delta * 0.1))
            device.setBrightness(config.brillo).catch(() => {})
        } else if (k.girar?.izquierda || k.girar?.derecha) {
            ejecutar(delta > 0 ? k.girar.derecha : k.girar.izquierda, 'down')
        }
    })

    device.on('touchstart', ({ changedTouches }) => {
        if (modo === 'monitor') return
        if (modo === 'mezcla') {
            // tocar una app la silencia (mitad izquierda = perillas izquierdas, derecha = derechas)
            for (const t of changedTouches) {
                if (t.target?.screen !== 'center') continue
                const fila = Math.min(2, Math.floor(t.y / 90)), der = t.x >= 240
                const c = canales[(der ? 3 : 0) + fila]
                if (c) { device.vibrate(HAPTIC.SHORT).catch(() => {}); silenciar(c) }
            }
            return
        }
        for (const t of changedTouches) {
            if (t.target?.key === undefined) continue
            // en Musica, tocar la portada = play/pausa
            if (paginaConMusica() && t.target.key === 7) { device.vibrate(HAPTIC.SHORT).catch(() => {}); enviar(`press 0 ${VK.MEDIA_PLAY_PAUSE}`); continue }
            const tecla = pagina().teclas[t.target.key]
            if (!tecla) continue
            device.drawKey(t.target.key, (ctx, w, h) => pintarTecla(ctx, w, h, tecla, true, OPC)).catch(() => {})
            device.vibrate(HAPTIC.SHORT).catch(() => {})
            ejecutar(tecla.accion, 'down', t.target.key)
        }
    })

    device.on('touchend', ({ changedTouches }) => {
        if (modo !== 'paginas') return
        for (const t of changedTouches) {
            if (t.target?.key === undefined) continue
            const tecla = pagina().teclas[t.target.key]
            if (!tecla) continue
            device.drawKey(t.target.key, (ctx, w, h) => pintarTecla(ctx, w, h, tecla, cicloActivo(t.target.key), OPC)).catch(() => {})
            ejecutar(tecla.accion, 'up', t.target.key)
        }
    })
}

// Animacion de bienvenida (~4 s): las teclas del logo se prenden, las luces hacen una ola y aparece el nombre
const LUCES = ['#00e5ff', '#2979ff', '#7c4dff', '#ff4081', '#ff9100', '#00e676', '#ffea00', '#ffffff']
async function animacionInicio() {
    const ms = Number(config.duracionInicioMs) || 4000
    const t0 = Date.now()
    for (let b = 0; b < 8; b++) await device.setButtonColor({ id: b, color: '#000000' }).catch(() => {})
    let ultimaLuz = -1
    let vibro = false
    while (Date.now() - t0 < ms * 0.7) {
        const t = Math.min(1, (Date.now() - t0) / (ms * 0.7))
        await device.drawScreen('center', (ctx, w, h) => pintarSplash(ctx, w, h, NOMBRE, 'Listo para jugar', t)).catch(() => {})
        const luz = Math.min(7, Math.floor(t / 0.6 * 8))
        while (ultimaLuz < luz) { ultimaLuz++; await device.setButtonColor({ id: ultimaLuz, color: LUCES[ultimaLuz] }).catch(() => {}) }
        if (!vibro && t > 0.6) { vibro = true; device.vibrate(HAPTIC.SHORT).catch(() => {}) }
        await esperar(70) // ~12 cuadros por segundo
    }
    await device.drawScreen('center', (ctx, w, h) => pintarSplash(ctx, w, h, NOMBRE, 'Listo para jugar', 1)).catch(() => {})
    // ola de luces mientras se queda el logo
    const fin = t0 + ms
    let paso = 0
    while (Date.now() < fin) {
        for (let b = 0; b < 8; b++) {
            const d = Math.abs(((paso % 10) - 1) - b)
            await device.setButtonColor({ id: b, color: d === 0 ? '#ffffff' : d === 1 ? LUCES[b] : atenuar(LUCES[b]) }).catch(() => {})
        }
        paso++
        await esperar(90)
    }
}

// ---------- Editor visual ----------
function abrirEditor() {
    const url = `http://127.0.0.1:${PUERTO_EDITOR}/`
    log('Abriendo editor:', url)
    spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true }).unref()
}

// el editor guardo: cambiamos el config por dentro y redibujamos, sin reiniciar nada
async function aplicarConfig(nuevo) {
    for (const k of Object.keys(config)) delete config[k]
    Object.assign(config, nuevo)
    derivar()
    OPC.etiquetas = config.etiquetas !== false
    PASO_VOLUMEN = Number(config.pasoVolumen) || 2
    IGNORAR = new Set((config.ignorar || ['escritorio']).map(s => s.toLowerCase()))
    detenerCiclos()
    if (!config.perfiles[perfilActual]) perfilActual = config.perfilPorDefecto
    if (paginaActual >= perfil().paginas.length) paginaActual = 0
    await cargarIconos(AQUI, config, log).catch(e => log('No pude cargar iconos:', e.message))
    // si la ventana activa ahora tiene otra regla, el perfil se acomoda solo
    const ultimo = [...recientes.keys()].pop()
    if (ultimo && !IGNORAR.has(ultimo)) {
        const r = reglaPara(ultimo)
        const destino = r ? r.perfil : config.perfilPorDefecto
        if (destino !== perfilActual && !esEditor(ultimo)) { perfilActual = destino; paginaActual = 0 }
    }
    if (device && conectado) await device.setBrightness(Number(config.brillo) || 0.8).catch(() => {})
    await dibujarTodo()
}
// mientras editas en el navegador, el perfil del navegador no debe "robarse" la vista previa
function esEditor(p) { return ['msedge', 'chrome', 'brave', 'firefox', 'opera'].includes(p) }

iniciarEditor({
    dir: AQUI, puerto: PUERTO_EDITOR, log, aplicarConfig,
    probar: accion => ejecutar(accion, 'down'),
    // el editor pide ver en la tableta el perfil y la pagina que estas editando
    mostrar: (nombre, pag) => {
        if (!config.perfiles[nombre]) return
        if (nombre !== perfilActual) detenerCiclos()
        perfilActual = nombre
        paginaActual = Math.max(0, Math.min(pag, perfil().paginas.length - 1))
        modo = 'paginas'
        dibujarTodo()
    },
    estado: () => ({
        perfil: perfilActual, pagina: paginaActual, modo, conectado,
        recientes: [...recientes.keys()].reverse().filter(p => !IGNORAR.has(p)),
    }),
    iconoApp: async ruta => {
        if (!ruta || ruta.toLowerCase().startsWith('shell:')) return null
        await iconoDeRuta(AQUI, ruta)
        const png = archivoIconoApp(AQUI, ruta)
        return existsSync(png) ? readFileSync(png) : null
    },
})

async function salir() {
    try {
        detenerCiclos(); detenerMonitor(); detenerMedia(); detenerMezclador()
        for (const vks of teclasMantenidas.values()) enviar(`up ${vks.join(',')}`)
        if (device) {
            for (let b = 0; b < 8; b++) await device.setButtonColor({ id: b, color: '#000000' }).catch(() => {})
            await device.drawScreen('center', ctx => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 360, 270) }).catch(() => {})
            await device.close().catch(() => {})
        }
    } catch { }
}

process.on('SIGINT', async () => { log('Cerrando...'); await salir(); process.exit(0) })

log(`${NOMBRE} iniciando. Perfil:`, perfilActual)
await cargarIconos(AQUI, config, log).catch(e => log('No pude cargar iconos:', e.message))
conectar()
