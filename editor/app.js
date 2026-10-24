// Editor visual de DeckPilot. Sin librerias externas: todo corre local y liviano.
import { parseTeclas } from '/teclas.js'

// ================= utilidades =================
const $ = s => document.querySelector(s)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function el(tag, props = {}, ...hijos) {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null || v === false) continue
        if (k === 'class') e.className = v
        else if (k === 'text') e.textContent = v
        else if (k === 'html') e.innerHTML = v
        else if (k === 'style') e.style.cssText = v
        else if (k === 'value') e.value = v
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
        else if (typeof v === 'boolean') e[k] = v
        else e.setAttribute(k, v)
    }
    for (const h of hijos.flat()) if (h != null && h !== false) e.append(h instanceof Node ? h : document.createTextNode(h))
    return e
}
async function api(ruta, op = {}) {
    const r = await fetch(ruta, { ...op, headers: { 'X-DeckPilot': '1', ...(op.body ? { 'Content-Type': 'application/json' } : {}) } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.json()
}
let timerAviso
function avisar(msg, tipo = '') {
    const a = $('#aviso')
    a.textContent = msg; a.className = 'aviso ' + tipo; a.hidden = false
    clearTimeout(timerAviso); timerAviso = setTimeout(() => (a.hidden = true), 2800)
}
const leerLocal = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } }
const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ================= iconos =================
let ICONOS = {}
const SVG_ABRE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
function svg(nombre, cls = 'ic') {
    const i = ICONOS[nombre]
    return i ? SVG_ABRE.replace('class="ic"', `class="${cls}"`) + i[0] + '</svg>' : ''
}
function svgEl(nombre, cls = 'ic') { const d = document.createElement('span'); d.innerHTML = svg(nombre, cls); return d.firstChild || document.createTextNode('') }
window.respaldoApp = img => { img.outerHTML = svg('app-window') }

// ================= colores (igual que en la tableta) =================
const rgb = hex => { const n = parseInt(String(hex || '#333333').replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const aclarar = (hex, f) => { const [r, g, b] = rgb(hex); return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})` }
const mezclar = (hex, f) => { const [r, g, b] = rgb(hex); return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})` }
const COLORES = ['#ff4d4d', '#ff2e7e', '#ff7a3d', '#ffb300', '#ffd600', '#00c853', '#00bfa5', '#00b4ff', '#2979ff', '#5e5ce6', '#b14dff', '#607d8b', '#8d6e63']

// ================= teclas: nombres y como se ven =================
const CODIGO = {
    Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Space: 'Space', Backspace: 'Backspace', Delete: 'Delete',
    Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', CapsLock: 'CapsLock', ScrollLock: 'ScrollLock', NumLock: 'NumLock', Pause: 'Pause',
    ContextMenu: 'Apps', PrintScreen: 'PrtSc', NumpadAdd: 'NumPlus', NumpadSubtract: 'NumMinus', NumpadMultiply: 'NumMult',
    NumpadDivide: 'NumDiv', NumpadDecimal: 'NumDot', ControlLeft: 'Ctrl', ControlRight: 'RCtrl', AltLeft: 'Alt', AltRight: 'RAlt',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', MetaLeft: 'Win', MetaRight: 'Win',
}
// signos: se graban por posicion fisica, asi funcionan igual con teclado en espanol o en ingles
const SC = { Minus: '0C', Equal: '0D', BracketLeft: '1A', BracketRight: '1B', Semicolon: '27', Quote: '28', Backquote: '29', Backslash: '2B', Comma: '33', Period: '34', Slash: '35', IntlBackslash: '56', IntlRo: '73' }
const SC_US = { '0C': '-', '0D': '=', '1A': '[', '1B': ']', '27': ';', '28': "'", '29': '`', '2B': '\\', '33': ',', '34': '.', '35': '/', '56': '<', '73': 'ro' }
function nombreDeCodigo(code) {
    if (CODIGO[code]) return CODIGO[code]
    let m
    if ((m = code.match(/^Key([A-Z])$/))) return m[1]
    if ((m = code.match(/^Digit([0-9])$/))) return m[1]
    if ((m = code.match(/^Numpad([0-9])$/))) return 'Num' + m[1]
    if ((m = code.match(/^F([0-9]{1,2})$/))) return 'F' + m[1]
    if (SC[code]) return 'SC:' + SC[code]
    return null
}
const MODS = ['Ctrl', 'RCtrl', 'Shift', 'Alt', 'RAlt', 'Win']
const BONITO = {
    CTRL: 'Ctrl', CONTROL: 'Ctrl', ALT: 'Alt', SHIFT: 'Shift', MAYUS: 'Shift', WIN: 'Win', ESC: 'Esc', ESCAPE: 'Esc', ENTER: 'Enter', INTRO: 'Enter',
    TAB: 'Tab', SPACE: 'Espacio', ESPACIO: 'Espacio', BACKSPACE: 'Retroceso', RETROCESO: 'Retroceso', DELETE: 'Supr', SUPR: 'Supr',
    INSERT: 'Insert', HOME: 'Inicio', INICIO: 'Inicio', END: 'Fin', FIN: 'Fin', PAGEUP: 'RePág', PAGEDOWN: 'AvPág',
    UP: '↑', ARRIBA: '↑', DOWN: '↓', ABAJO: '↓', LEFT: '←', IZQUIERDA: '←', RIGHT: '→', DERECHA: '→',
    CAPSLOCK: 'Bloq Mayús', BLOQMAYUS: 'Bloq Mayús', RALT: 'Alt Gr', ALTGR: 'Alt Gr', RCTRL: 'Ctrl der.', PRTSC: 'Impr Pant', IMPRPANT: 'Impr Pant',
    NUMPLUS: 'Num +', 'NUM+': 'Num +', NUMMINUS: 'Num −', 'NUM-': 'Num −', NUMMULT: 'Num ×', NUMDIV: 'Num ÷', NUMDOT: 'Num .',
    SCROLLLOCK: 'Bloq Despl', PAUSE: 'Pausa', NUMLOCK: 'Bloq Num', APPS: 'Menú', MENU: 'Menú', PLUS: '+', MINUS: '-', SLASH: '/',
}
let mapaTeclado = null
function etiquetaTecla(n) {
    const u = String(n).trim().toUpperCase()
    if (BONITO[u]) return BONITO[u]
    let m = u.match(/^NUM([0-9])$/)
    if (m) return 'Num ' + m[1]
    m = u.match(/^SC:([0-9A-F]+)$/)
    if (m) {
        const sc = m[1].padStart(2, '0')
        const cod = Object.keys(SC).find(k => SC[k] === sc)
        const ch = cod && mapaTeclado?.get(cod)
        return ch ? ch.toUpperCase() : (SC_US[sc] || 'Tecla ' + sc)
    }
    return String(n).trim()
}
const partesCombo = s => String(s || '').replace(/\+\+$/, '+PLUS').split('+').filter(Boolean)
const bonitoCombo = s => partesCombo(s).map(etiquetaTecla).join(' + ')
const ordenar = l => [...MODS.filter(m => l.includes(m)), ...l.filter(n => !MODS.includes(n))]

const MEDIA = { PlayPause: 'Play / Pausa', Next: 'Siguiente', Prev: 'Anterior', Mute: 'Silenciar', VolUp: 'Subir volumen', VolDown: 'Bajar volumen' }
const archivoDe = r => { const s = String(r || ''); return (s.includes('!') ? s.split('!').pop() : s.split(/[\\/]/).pop()).replace(/\.(exe|lnk|url|wav|bat)$/i, '') }
function resumen(a) {
    if (!a) return ''
    switch (a.tipo) {
        case 'tecla': return bonitoCombo(a.teclas) + (a.modo === 'mantener' ? ' (mantener)' : '')
        case 'ciclo': return '↻ ' + bonitoCombo(a.teclas)
        case 'escribir': return '⌨ ' + String(a.texto || '').replace(/\n/g, '⏎')
        case 'abrir': return '▶ ' + archivoDe(a.ruta)
        case 'media': return MEDIA[a.tecla] || a.tecla
        case 'sonido': return '♪ ' + archivoDe(a.archivo)
        case 'editor': return 'Abrir editor'
        case 'volverALoupedeck': return 'Volver a Loupedeck'
    }
    return a.tipo
}

// ================= estado del editor =================
let cfg = null
let sel = { perfil: null, pagina: 0, item: null } // item: {tipo:'tecla', i} | {tipo:'perilla', id, ambito} | {tipo:'pagina'}
let historial = [], futuro = [], ultimaClave = null, ultimaHora = 0
let sucio = false
let portapapeles = leerLocal('dp-portapapeles', null)
let vivo = {}
let reflejar = leerLocal('dp-reflejar', true)

const perfilSel = () => cfg.perfiles[sel.perfil]
const paginaSel = () => perfilSel().paginas[sel.pagina]
const nombrePerfil = k => cfg.perfiles[k]?.nombre || (k.charAt(0).toUpperCase() + k.slice(1))
const PERILLAS = { knobTL: 'Perilla arriba izquierda', knobCL: 'Perilla centro izquierda', knobBL: 'Perilla abajo izquierda', knobTR: 'Perilla arriba derecha', knobCR: 'Perilla centro derecha', knobBR: 'Perilla abajo derecha' }

function normalizar(c) {
    c.perfiles ||= {}
    c.reglas ||= []
    for (const p of Object.values(c.perfiles)) {
        p.paginas ||= [{ nombre: 'Principal', color: '#2979ff', teclas: [] }]
        for (const pg of p.paginas) { pg.teclas ||= []; while (pg.teclas.length < 12) pg.teclas.push(null); pg.teclas.length = 12 }
    }
    return c
}

function cambiar(fn, op = {}) {
    const ahora = Date.now()
    if (!(op.clave && op.clave === ultimaClave && ahora - ultimaHora < 1500)) {
        historial.push(JSON.stringify(cfg)); if (historial.length > 150) historial.shift()
        futuro = []
    }
    ultimaClave = op.clave || null; ultimaHora = ahora
    fn()
    marcar(true)
    if (op.parcial) { renderTableta(); renderPestanas(); renderPerfiles(); refrescarVistaGrande() } else render()
}
function deshacer() {
    if (!historial.length) return
    futuro.push(JSON.stringify(cfg)); cfg = JSON.parse(historial.pop()); ultimaClave = null
    acomodarSeleccion(); marcar(true); render()
}
function rehacer() {
    if (!futuro.length) return
    historial.push(JSON.stringify(cfg)); cfg = JSON.parse(futuro.pop()); ultimaClave = null
    acomodarSeleccion(); marcar(true); render()
}
function acomodarSeleccion() {
    if (!cfg.perfiles[sel.perfil]) sel.perfil = cfg.perfilPorDefecto in cfg.perfiles ? cfg.perfilPorDefecto : Object.keys(cfg.perfiles)[0]
    if (sel.pagina >= perfilSel().paginas.length) sel.pagina = 0
}
function marcar(v) {
    sucio = v
    const b = $('#bGuardar')
    b.disabled = !v
    b.textContent = v ? 'Guardar' : 'Guardado'
    $('#bDeshacer').disabled = !historial.length
    $('#bRehacer').disabled = !futuro.length
    document.title = (v ? '● ' : '') + 'DeckPilot Editor'
}

async function guardar() {
    if (!sucio) return
    const b = $('#bGuardar')
    b.disabled = true; b.textContent = 'Guardando…'
    try {
        const r = await api('/api/config', { method: 'POST', body: JSON.stringify(cfg) })
        if (!r.ok) { avisar('No se guardó: ' + r.error, 'mal'); marcar(true); return }
        marcar(false)
        avisar('Guardado. Ya está en tu tableta.', 'bien')
        mostrarEnTableta()
    } catch (e) {
        avisar('DeckPilot no responde. ¿Está abierto?', 'mal'); marcar(true)
    }
}

// la tableta muestra el perfil y la pagina que estas editando
let timerMostrar
function mostrarEnTableta() {
    if (!reflejar || !sel.perfil) return
    clearTimeout(timerMostrar)
    timerMostrar = setTimeout(() => api(`/api/mostrar?perfil=${encodeURIComponent(sel.perfil)}&pagina=${sel.pagina}`, { method: 'POST' }).catch(() => {}), 150)
}

// ================= reglas (que programa activa cada perfil) =================
function procesosDe(k) { return cfg.reglas.filter(r => r.perfil === k).flatMap(r => r.procesos || [r.proceso]).filter(Boolean) }
function perfilDeProceso(p) { const r = cfg.reglas.find(r => (r.procesos || [r.proceso]).some(x => String(x).toLowerCase() === p)); return r?.perfil }
function ponerProcesos(k, lista) {
    const i = cfg.reglas.findIndex(r => r.perfil === k)
    cfg.reglas = cfg.reglas.filter(r => r.perfil !== k)
    if (lista.length) cfg.reglas.splice(i < 0 ? cfg.reglas.length : i, 0, { procesos: lista, perfil: k })
}
function agregarProceso(k, proceso) {
    proceso = normal(proceso).replace(/\.exe$/, '').trim()
    if (!proceso) return
    cambiar(() => {
        for (const r of cfg.reglas) if (r.procesos) r.procesos = r.procesos.filter(x => String(x).toLowerCase() !== proceso)
        cfg.reglas = cfg.reglas.filter(r => !r.procesos || r.procesos.length)
        ponerProcesos(k, [...procesosDe(k), proceso])
    })
}

// ================= dibujo de una tecla =================
function iconoDe(t) {
    if (!t) return null
    if (t.icono && t.icono !== 'app') return { tipo: 'tabler', n: t.icono }
    if (t.accion?.tipo === 'abrir' && t.accion.ruta && !t.accion.ruta.toLowerCase().startsWith('shell:')) return { tipo: 'app', ruta: t.icono_de || t.accion.ruta }
    return t.icono_respaldo ? { tipo: 'tabler', n: t.icono_respaldo } : null
}
function fondoTecla(t) {
    const base = t.color || '#5e5ce6'
    return iconoDe(t)?.tipo === 'app' ? `linear-gradient(${mezclar(base, .55)}, ${mezclar(base, .28)})` : `linear-gradient(${aclarar(base, .18)}, ${mezclar(base, .92)})`
}
function htmlTecla(t, conAtajo = true) {
    if (!t) return '+'
    const i = iconoDe(t)
    let ic = ''
    if (i?.tipo === 'tabler') ic = svg(i.n)
    else if (i?.tipo === 'app') ic = `<img class="ic" alt="" loading="lazy" src="/api/icono-app?ruta=${encodeURIComponent(i.ruta)}" onerror="respaldoApp(this)">`
    const ins = t.insignia && ic ? `<span class="ins">${esc(t.insignia)}</span>` : ''
    const at = conAtajo && t.accion ? `<span class="atajo">${esc(resumen(t.accion))}</span>` : ''
    if (!ic) return `${at}<div class="solo">${esc(t.texto || '')}</div>`
    const texto = cfg.etiquetas !== false && t.texto ? `<div class="t">${esc(String(t.texto).replace(/\n/g, ' '))}</div>` : ''
    return at + ins + ic + texto
}

// ================= render =================
function render() {
    if (!cfg) return
    renderPerfiles(); renderCabecera(); renderPestanas(); renderTableta(); renderInspector()
    marcar(sucio)
}

function renderPerfiles() {
    const ul = $('#listaPerfiles')
    ul.innerHTML = ''
    for (const k of Object.keys(cfg.perfiles)) {
        const p = cfg.perfiles[k]
        ul.append(el('li', { class: k === sel.perfil ? 'sel' : '', title: procesosDe(k).join(', ') || 'Sin programas asignados', onclick: () => elegirPerfil(k) },
            el('span', { class: 'punto', style: `background:${p.paginas[0]?.color || '#555'}` }),
            el('span', { class: 'n', text: nombrePerfil(k) }),
            k === cfg.perfilPorDefecto ? el('span', { class: 'estrella', title: 'Perfil principal (Home)', text: '★' }) : null,
            vivo.conectado && vivo.perfil === k ? el('span', { class: 'vivo', title: 'Es el que ves ahora en la tableta', text: 'EN USO' }) : null))
    }
}
function elegirPerfil(k) {
    if (sel.perfil === k) return
    sel = { perfil: k, pagina: 0, item: null }
    render(); mostrarEnTableta()
}

function renderCabecera() {
    const k = sel.perfil
    const inp = $('#nombrePerfil')
    if (document.activeElement !== inp) inp.value = nombrePerfil(k)
    const principal = k === cfg.perfilPorDefecto
    $('#marcaPrincipal').hidden = !principal
    $('#bPrincipal').hidden = principal
    $('#bBorrarPerfil').disabled = principal
    $('#bBorrarPerfil').title = principal ? 'El perfil principal no se puede eliminar' : ''
    const chips = $('#chipsProcesos')
    chips.innerHTML = ''
    const lista = procesosDe(k)
    if (principal && !lista.length) chips.append(el('span', { class: 'chip vacio', text: 'todo lo que no tenga perfil propio' }))
    else if (!lista.length) chips.append(el('span', { class: 'chip vacio', text: 'ningún programa todavía' }))
    for (const p of lista) chips.append(el('span', { class: 'chip' }, p, el('button', {
        title: 'Quitar', text: '×',
        onclick: () => cambiar(() => ponerProcesos(k, procesosDe(k).filter(x => x !== p))),
    })))
}

function renderPestanas() {
    const nav = $('#pestanas')
    nav.innerHTML = ''
    const paginas = perfilSel().paginas
    paginas.forEach((pg, i) => {
        const enVivo = vivo.conectado && vivo.modo === 'paginas' && vivo.perfil === sel.perfil && vivo.pagina === i
        const t = el('div', {
            class: 'pestana' + (i === sel.pagina ? ' sel' : ''), title: `Botón redondo ${i + 2}`,
            onclick: e => {
                if (e.target.closest('.eng')) { sel.pagina = i; sel.item = { tipo: 'pagina' }; render(); mostrarEnTableta(); return }
                if (sel.pagina !== i) { sel.pagina = i; sel.item = null; render(); mostrarEnTableta() }
            },
            ondragover: e => { if (arrastre?.tipo === 'tecla') { e.preventDefault(); t.classList.add('sel') } },
            ondragleave: () => { if (i !== sel.pagina) t.classList.remove('sel') },
            ondrop: e => { e.preventDefault(); moverTeclaAPagina(i) },
        },
            el('span', { class: 'c', style: `background:${pg.color || '#555'}` }),
            el('span', { text: pg.nombre || `Página ${i + 1}` }),
            pg.visualizador ? el('span', { class: 'num', title: 'Página de música', text: '♪' }) : null,
            enVivo ? el('span', { class: 'vivo', text: 'EN USO' }) : null,
            el('span', { class: 'eng', title: 'Ajustes de la página', text: '⚙' }))
        nav.append(t)
    })
    if (paginas.length < 5) nav.append(el('button', { class: 'btn chico', text: '+ Página', onclick: nuevaPagina }))
    else nav.append(el('span', { class: 'etq', text: 'Máximo 5 páginas (botones redondos 2 a 6)' }))
}
function nuevaPagina() {
    cambiar(() => {
        const ps = perfilSel().paginas
        ps.push({ nombre: `Página ${ps.length + 1}`, color: COLORES[(ps.length * 3) % COLORES.length], teclas: Array(12).fill(null) })
        sel.pagina = ps.length - 1; sel.item = { tipo: 'pagina' }
    })
    mostrarEnTableta()
}

let arrastre = null
function renderTableta() {
    const pg = paginaSel()
    const rej = $('#rejilla')
    rej.innerHTML = ''
    pg.teclas.forEach((t, i) => {
        if (pg.visualizador && i >= 7) {
            rej.append(el('div', { class: 'tecla musica', title: 'Zona de música: portada y barras', text: i === 7 ? '♪ portada' : i === 8 ? 'barras de música' : '' }))
            return
        }
        const d = el('div', {
            class: 'tecla' + (t ? '' : ' vacia') + (sel.item?.tipo === 'tecla' && sel.item.i === i ? ' sel' : ''),
            draggable: !!t, title: t ? (t.texto || '') + (t.accion ? ' — ' + resumen(t.accion) : '') : 'Tecla vacía: clic para crear',
            onclick: () => { sel.item = { tipo: 'tecla', i }; renderTableta(); renderInspector() },
            ondragstart: e => { arrastre = { tipo: 'tecla', i }; e.dataTransfer.effectAllowed = 'move'; d.classList.add('arrastrando') },
            ondragend: () => { arrastre = null; renderTableta(); renderPestanas() },
            ondragover: e => { if (arrastre?.tipo === 'tecla') { e.preventDefault(); d.classList.add('sobre') } },
            ondragleave: () => d.classList.remove('sobre'),
            ondrop: e => {
                e.preventDefault()
                const de = arrastre?.i
                if (de == null || de === i) return
                cambiar(() => { const ts = paginaSel().teclas; [ts[de], ts[i]] = [ts[i], ts[de]]; sel.item = { tipo: 'tecla', i } })
            },
        })
        d.innerHTML = htmlTecla(t)
        if (t) d.style.background = fondoTecla(t)
        rej.append(d)
    })
    // perillas
    const pintarLado = (cont, ids) => {
        cont.innerHTML = ''
        for (const id of ids) {
            const propia = perfilSel().perillas?.[id]
            const global = cfg.perillas?.[id]
            const k = propia || global
            const s = sel.item?.tipo === 'perilla' && sel.item.id === id
            cont.append(el('div', {
                class: 'perilla' + (s ? ' sel' : '') + (!propia && global ? ' heredada' : '') + (!k ? ' vacia' : ''),
                title: PERILLAS[id] + (!propia && global ? ' (la misma en todos los perfiles)' : ''),
                onclick: () => { sel.item = { tipo: 'perilla', id, ambito: propia || !global ? 'perfil' : 'global' }; renderTableta(); renderInspector() },
            },
                !propia && global ? el('span', { class: 'g', text: '⦿' }) : null,
                el('div', { class: 'rueda' }, k?.icono ? svgEl(k.icono, '') : ''),
                el('div', { class: 'n', text: k?.nombre || 'vacía' })))
        }
    }
    pintarLado($('#ladoIzq'), ['knobTL', 'knobCL', 'knobBL'])
    pintarLado($('#ladoDer'), ['knobTR', 'knobCR', 'knobBR'])
    // botones redondos
    const r = $('#redondos')
    r.innerHTML = ''
    const paginas = perfilSel().paginas
    for (let b = 0; b < 8; b++) {
        let color = '#000', tip = '', clic = null, s = false
        if (b === 0) { color = '#fff'; tip = 'Home: ir a Inicio; otro toque te regresa a la app (mantener 1.5 s = editor)' }
        else if (b === 6) { color = '#00e676'; tip = 'Mezclador de volumen' }
        else if (b === 7) { color = '#00e5ff'; tip = 'Monitor de rendimiento' }
        else if (b - 1 < paginas.length) { color = paginas[b - 1].color; tip = paginas[b - 1].nombre; s = b - 1 === sel.pagina; clic = () => { sel.pagina = b - 1; sel.item = null; render(); mostrarEnTableta() } }
        r.append(el('div', { class: 'redondo' + (s ? ' sel' : ''), 'data-tip': tip || 'Sin página', onclick: clic }, el('i', { style: `background:${color}` })))
    }
}

function moverTeclaAPagina(destino) {
    if (!arrastre || arrastre.tipo !== 'tecla' || destino === sel.pagina) return
    const ts = perfilSel().paginas[destino].teclas
    const pgD = perfilSel().paginas[destino]
    const libre = ts.findIndex((t, i) => !t && !(pgD.visualizador && i >= 7))
    if (libre < 0) { avisar('Esa página está llena', 'mal'); return }
    const de = arrastre.i
    cambiar(() => { ts[libre] = paginaSel().teclas[de]; paginaSel().teclas[de] = null; sel.pagina = destino; sel.item = { tipo: 'tecla', i: libre } })
    mostrarEnTableta()
}

// ================= inspector =================
function renderInspector() {
    const box = $('#inspector')
    box.innerHTML = ''
    const it = sel.item
    if (it?.tipo === 'tecla') return inspectorTecla(box, it.i)
    if (it?.tipo === 'perilla') return inspectorPerilla(box, it.id)
    if (it?.tipo === 'pagina') return inspectorPagina(box)
    box.append(el('div', { class: 'vacioInsp' },
        el('div', { class: 'grande', text: '👆' }),
        el('p', { text: 'Elige una tecla o una perilla de la tableta para editarla.' }),
        el('ul', {},
            el('li', { text: 'Para asignar una tecla: clic en el recuadro y presiona la combinación en tu teclado.' }),
            el('li', { text: 'Arrastra una tecla sobre otra para intercambiarlas, o sobre una pestaña para moverla de página.' }),
            el('li', { text: 'Ctrl+C / Ctrl+V copia teclas entre páginas y perfiles.' }),
            el('li', { text: 'Ctrl+S guarda y la tableta cambia al instante.' }))))
}

function refrescarVistaGrande() {
    const v = $('#vistaGrande')
    if (!v || sel.item?.tipo !== 'tecla') return
    const t = paginaSel().teclas[sel.item.i]
    const d = v.firstChild
    d.innerHTML = htmlTecla(t, false)
    d.style.background = t ? fondoTecla(t) : ''
}

function campo(etq, ...hijos) { return el('div', { class: 'campo' }, el('span', { class: 'l', text: etq }), ...hijos) }

function selectorColor(actual, alCambiar) {
    const cont = el('div', { class: 'muestras' })
    for (const c of COLORES) cont.append(el('button', {
        class: 'muestra' + (String(actual).toLowerCase() === c ? ' sel' : ''), style: `background:${c}`, title: c,
        onclick: () => { alCambiar(c); cont.querySelectorAll('.muestra').forEach(m => m.classList.toggle('sel', m.title === c)) },
    }))
    const otro = el('label', { class: 'muestra otro', title: 'Otro color' },
        el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(actual || '') ? actual : '#5e5ce6', oninput: e => alCambiar(e.target.value) }))
    cont.append(otro)
    return cont
}

function selectorIcono(obtener, poner, { conApp = false } = {}) {
    const vista = el('div', { class: 'vista' })
    const pintar = () => {
        const t = obtener()
        const i = conApp ? iconoDe(t) : (t?.icono ? { tipo: 'tabler', n: t.icono } : null)
        vista.innerHTML = i?.tipo === 'app' ? `<img alt="" src="/api/icono-app?ruta=${encodeURIComponent(i.ruta)}" onerror="respaldoApp(this)">` : (i ? svg(i.n, '') : '')
    }
    pintar()
    const t = obtener()
    const fila = el('div', { class: 'selIcono' }, vista,
        el('button', { class: 'btn chico', text: 'Elegir…', onclick: () => galeria(t?.icono, n => { poner(n); pintar() }) }),
        t?.icono && t.icono !== 'app' ? el('button', { class: 'btn chico', text: 'Quitar', onclick: () => { poner(null); render() } }) : null)
    return fila
}

function inspectorTecla(box, i) {
    const pg = paginaSel()
    const T = () => paginaSel().teclas[i]
    const t = T()
    const pos = `Fila ${Math.floor(i / 4) + 1}, tecla ${(i % 4) + 1}`
    box.append(el('h3', { text: t ? (t.texto || 'Tecla sin nombre') : 'Tecla vacía' }), el('p', { class: 'sub', text: `${pos} · ${pg.nombre} · ${nombrePerfil(sel.perfil)}` }))

    if (!t) {
        box.append(el('p', { class: 'sub', text: '¿Qué quieres que haga esta tecla?' }))
        const tipos = el('div', { class: 'tipos' })
        for (const [tipo, txt, ic] of TIPOS_ACCION.filter(x => x[0] !== 'ninguna')) {
            tipos.append(el('button', {
                class: 'tipo', onclick: () => cambiar(() => {
                    paginaSel().teclas[i] = { texto: '', color: pg.color || '#2979ff', accion: accionNueva(tipo) }
                    if (tipo === 'media') paginaSel().teclas[i].icono = 'player-play'
                }),
            }, svgEl(ic, ''), txt))
        }
        box.append(tipos)
        if (portapapeles) box.append(el('div', { class: 'pie' }, el('button', { class: 'btn', text: `Pegar «${portapapeles.texto || 'tecla'}»`, onclick: () => pegar(i) })))
        return
    }

    box.append(el('div', { class: 'vistaGrande', id: 'vistaGrande' }, el('div', { class: 'tecla' })))
    refrescarVistaGrande()

    box.append(campo('Texto', el('input', {
        class: 'entrada', value: t.texto || '', placeholder: 'Nombre corto (ej. Mapa)', maxlength: '40',
        oninput: e => cambiar(() => { T().texto = e.target.value }, { clave: 'texto' + i, parcial: true }),
    })))

    const esAbrir = t.accion?.tipo === 'abrir'
    const ci = campo('Ícono', selectorIcono(T, n => cambiar(() => { if (n) T().icono = n; else delete T().icono }, { parcial: true }), { conApp: true }))
    if (esAbrir && t.icono && t.icono !== 'app') ci.append(el('button', { class: 'btn chico', style: 'margin-top:8px', text: 'Usar el ícono del programa', onclick: () => cambiar(() => { delete T().icono }) }))
    box.append(ci)

    box.append(campo('Color', selectorColor(t.color, c => cambiar(() => { T().color = c }, { clave: 'color' + i, parcial: true }))))

    const cAcc = campo('Al tocarla')
    editorAccion(cAcc, () => T().accion, (a, op) => cambiar(() => { if (a === undefined) return; T().accion = a }, op), { conMantener: true, teclaI: i })
    box.append(cAcc)

    const mas = el('details', { class: 'avanzado' }, el('summary', { text: 'Más opciones' }),
        campo('Insignia (texto chiquito arriba a la derecha)', el('input', {
            class: 'entrada', value: t.insignia || '', placeholder: 'ej. ON/OFF', maxlength: '8',
            oninput: e => cambiar(() => { if (e.target.value) T().insignia = e.target.value; else delete T().insignia }, { clave: 'ins' + i, parcial: true }),
        })))
    box.append(mas)

    box.append(el('div', { class: 'pie' },
        el('button', { class: 'btn chico', text: 'Copiar', onclick: () => copiar(i) }),
        el('button', { class: 'btn chico', text: 'Duplicar', onclick: () => duplicar(i) }),
        el('button', { class: 'btn chico peligro', text: 'Vaciar', onclick: () => vaciar(i) })))
}

const TIPOS_ACCION = [
    ['tecla', 'Tecla', 'keyboard'], ['ciclo', 'Repetir', 'repeat'], ['escribir', 'Escribir', 'typography'], ['abrir', 'Abrir', 'app-window'],
    ['media', 'Música', 'player-play'], ['sonido', 'Sonido', 'volume'], ['editor', 'Editor', 'adjustments-horizontal'], ['ninguna', 'Nada', 'x'],
]
function accionNueva(tipo, previa = {}) {
    switch (tipo) {
        case 'tecla': return { tipo, teclas: previa?.teclas || '' }
        case 'ciclo': return { tipo, teclas: previa?.teclas || '', mantenerMs: 150, intervaloMs: 400 }
        case 'escribir': return { tipo, texto: '' }
        case 'abrir': return { tipo, ruta: '' }
        case 'media': return { tipo, tecla: 'PlayPause' }
        case 'sonido': return { tipo, archivo: '' }
        case 'editor': return { tipo }
        default: return null
    }
}

// editor de una accion (sirve para teclas y para el "presionar" de las perillas)
function editorAccion(cont, obtener, poner, op = {}) {
    const a = obtener()
    const actual = a?.tipo || 'ninguna'
    const tipos = el('div', { class: 'tipos' })
    const lista = op.tipos ? TIPOS_ACCION.filter(x => op.tipos.includes(x[0])) : TIPOS_ACCION
    for (const [tipo, txt, ic] of lista) {
        tipos.append(el('button', {
            class: 'tipo' + (tipo === actual ? ' sel' : ''),
            onclick: () => { if (tipo !== actual) { poner(accionNueva(tipo, obtener())); } },
        }, svgEl(ic, ''), txt))
    }
    cont.append(tipos)
    const det = el('div', { style: 'margin-top:12px' })
    cont.append(det)
    if (!a) return

    if (a.tipo === 'tecla' || a.tipo === 'ciclo') {
        det.append(campoTeclas(a.teclas, v => cambiar(() => { obtener().teclas = v }, { parcial: true }), op.teclaI))
        if (a.tipo === 'tecla' && op.conMantener) {
            det.append(el('div', { class: 'campo' }, el('div', { class: 'seg' },
                el('button', { class: a.modo !== 'mantener' ? 'sel' : '', text: 'Pulsar una vez', onclick: () => cambiar(() => { delete obtener().modo }) }),
                el('button', { class: a.modo === 'mantener' ? 'sel' : '', text: 'Mantener mientras tocas', onclick: () => cambiar(() => { obtener().modo = 'mantener' }) }))))
        }
        if (a.tipo === 'ciclo') {
            det.append(el('div', { class: 'info-campo', text: 'Toca una vez y la tecla se repite sola. Vuelve a tocar para detenerla.' }))
            det.append(campo('Repetir cada (milisegundos)', el('input', {
                class: 'entrada', type: 'number', min: '150', step: '50', value: a.intervaloMs ?? 400,
                oninput: e => cambiar(() => { obtener().intervaloMs = Math.max(150, Number(e.target.value) || 400) }, { clave: 'int', parcial: true }),
            })))
        }
        if (a.tipo === 'tecla' && a.modo !== 'mantener') {
            det.append(el('details', { class: 'avanzado' }, el('summary', { text: 'Tiempo presionada' }),
                campo(`Milisegundos (vacío = ${cfg.mantenerTeclaMs || 90}, sube si un juego no la detecta)`, el('input', {
                    class: 'entrada', type: 'number', min: '0', step: '10', value: a.mantenerMs ?? '', placeholder: String(cfg.mantenerTeclaMs || 90),
                    oninput: e => cambiar(() => { const v = e.target.value; if (v === '') delete obtener().mantenerMs; else obtener().mantenerMs = Math.max(0, Number(v)) }, { clave: 'mms', parcial: true }),
                }))))
        }
    } else if (a.tipo === 'escribir') {
        det.append(campo('Texto que se escribe', el('textarea', {
            class: 'entrada', value: a.texto || '', placeholder: 'ej. /home\nCada salto de línea presiona Enter',
            oninput: e => cambiar(() => { obtener().texto = e.target.value }, { clave: 'esc', parcial: true }),
        })), el('div', { class: 'info-campo', text: 'Cada salto de línea presiona Enter.' }))
    } else if (a.tipo === 'abrir') {
        const inp = el('input', { class: 'entrada', value: a.ruta || '', placeholder: 'C:\\...\\programa.exe', oninput: e => cambiar(() => { obtener().ruta = e.target.value }, { clave: 'ruta', parcial: true }) })
        det.append(campo('Programa, acceso directo o carpeta', el('div', { class: 'fila' }, inp,
            el('button', { class: 'btn chico', text: 'Buscar…', onclick: () => elegirArchivo('programa', r => { cambiar(() => { obtener().ruta = r; const t = paginaSel().teclas[op.teclaI]; if (t && !t.texto) t.texto = archivoDe(r) }); }) }))),
            el('div', { class: 'fila' }, el('button', { class: 'btn chico', text: 'Probar ahora', onclick: () => probar(obtener()) })))
        det.append(el('details', { class: 'avanzado', style: 'margin-top:10px' }, el('summary', { text: 'Argumentos' }),
            el('input', { class: 'entrada', value: a.args || '', placeholder: 'opcional', oninput: e => cambiar(() => { if (e.target.value) obtener().args = e.target.value; else delete obtener().args }, { clave: 'args', parcial: true }) })))
    } else if (a.tipo === 'media') {
        const seg = el('div', { class: 'tipos' })
        for (const [k, txt] of Object.entries(MEDIA)) seg.append(el('button', { class: 'tipo' + (a.tecla === k ? ' sel' : ''), text: txt, onclick: () => cambiar(() => { obtener().tecla = k }) }))
        det.append(seg)
    } else if (a.tipo === 'sonido') {
        const inp = el('input', { class: 'entrada', value: a.archivo || '', placeholder: 'C:\\...\\sonido.wav', oninput: e => cambiar(() => { obtener().archivo = e.target.value }, { clave: 'snd', parcial: true }) })
        det.append(campo('Archivo .wav', el('div', { class: 'fila' }, inp,
            el('button', { class: 'btn chico', text: 'Buscar…', onclick: () => elegirArchivo('sonido', r => cambiar(() => { obtener().archivo = r })) }),
            el('button', { class: 'btn chico', text: '▶', title: 'Escuchar', onclick: () => probar(obtener()) }))))
    } else if (a.tipo === 'editor') {
        det.append(el('div', { class: 'info-campo', text: 'Abre este editor en tu navegador.' }))
    } else if (a.tipo === 'volverALoupedeck') {
        det.append(el('div', { class: 'info-campo', text: 'Cierra DeckPilot y abre Loupedeck.' }))
    }
}

const ESPECIALES = [
    ['Win', 'Win (menú inicio)'], ['Win+G', 'Win + G (Game Bar)'], ['Win+H', 'Win + H (dictar)'], ['Win+Shift+S', 'Win + Shift + S (recorte)'],
    ['Win+D', 'Win + D (escritorio)'], ['Win+Alt+R', 'Win + Alt + R (grabar)'], ['Win+Alt+PrtSc', 'Win + Alt + Impr Pant'], ['Win+V', 'Win + V (portapapeles)'],
    ['Alt+Tab', 'Alt + Tab'], ['Alt+F4', 'Alt + F4 (cerrar)'], ['PrtSc', 'Impr Pant'], ['CapsLock', 'Bloq Mayús'], ['RAlt', 'Alt Gr'], ['Apps', 'Tecla menú'],
]
function campoTeclas(valor, alCambiar, teclaI) {
    const cont = el('div', { class: 'campo' })
    let caja
    const poner = v => { valor = v; alCambiar(v); const n = captura(v, poner); caja.replaceWith(n); caja = n; avisos() }
    caja = captura(valor, poner)
    const aviso = el('div')
    const avisos = () => {
        aviso.innerHTML = ''
        if (valor && !parseTeclas(valor)) aviso.append(el('div', { class: 'aviso-campo', text: 'No reconozco esa combinación.' }))
        const otras = valor ? usosDe(valor, teclaI) : []
        if (otras.length) aviso.append(el('div', { class: 'aviso-campo', text: 'También la usa: ' + otras.join(', ') }))
    }
    avisos()
    const especial = el('select', { class: 'entrada', style: 'flex:1', onchange: e => { if (e.target.value) poner(e.target.value) } },
        el('option', { value: '', text: 'Teclas que Windows no deja grabar…' }), ...ESPECIALES.map(([v, t]) => el('option', { value: v, text: t })))
    const manual = el('input', { class: 'entrada', value: valor || '', placeholder: 'ej. Ctrl+Shift+T', onchange: e => poner(e.target.value.trim()) })
    cont.append(caja, aviso, el('div', { class: 'fila', style: 'margin-top:8px' }, especial),
        el('details', { class: 'avanzado', style: 'margin-top:8px' }, el('summary', { text: 'Escribir a mano' }), manual))
    return cont
}
// otras teclas de este perfil con la misma combinacion (para evitar choques)
function usosDe(valor, excluirI) {
    const v = ordenar(partesCombo(valor).map(x => x.toUpperCase())).join('+')
    const r = []
    perfilSel().paginas.forEach((pg, pi) => pg.teclas.forEach((t, ti) => {
        if (!t?.accion || !['tecla', 'ciclo'].includes(t.accion.tipo)) return
        if (pi === sel.pagina && ti === excluirI) return
        if (ordenar(partesCombo(t.accion.teclas).map(x => x.toUpperCase())).join('+') === v) r.push(`${t.texto || 'tecla'} (${pg.nombre})`)
    }))
    return r
}

function captura(valor, alCambiar) {
    const caja = el('div', { class: 'captura', tabindex: '0', title: 'Clic aquí y presiona la tecla o combinación' })
    let escuchando = false, presionadas = [], activas = new Set(), ultimoCtrl = -1e9
    const pintar = (lista, ph) => {
        caja.innerHTML = ''
        if (!lista.length) caja.append(el('span', { class: 'ph', text: ph }))
        lista.forEach((n, i) => { if (i) caja.append(el('span', { class: 'mas', text: '+' })); caja.append(el('kbd', { text: etiquetaTecla(n) })) })
    }
    const mostrar = () => { pintar(partesCombo(valor), 'Clic aquí y presiona la tecla'); caja.classList.toggle('error', !!valor && !parseTeclas(valor)) }
    mostrar()
    caja.addEventListener('focus', () => { escuchando = true; presionadas = []; activas.clear(); caja.classList.add('escuchando'); pintar([], 'Escuchando… presiona la combinación') })
    caja.addEventListener('blur', () => { escuchando = false; caja.classList.remove('escuchando'); mostrar() })
    caja.addEventListener('keydown', e => {
        if (!escuchando) return
        e.preventDefault(); e.stopPropagation()
        if (e.repeat) return
        const n = nombreDeCodigo(e.code)
        if (!n) return
        if (e.code === 'ControlLeft') ultimoCtrl = e.timeStamp
        // Alt Gr en teclados en espanol llega como Ctrl + Alt derecho: nos quedamos solo con Alt Gr
        if (n === 'RAlt' && e.timeStamp - ultimoCtrl < 80) { presionadas = presionadas.filter(x => x !== 'Ctrl'); activas.delete('Ctrl') }
        if (!presionadas.includes(n)) presionadas.push(n)
        activas.add(n)
        pintar(ordenar(presionadas), '')
    })
    caja.addEventListener('keyup', e => {
        if (!escuchando) return
        e.preventDefault(); e.stopPropagation()
        const n = nombreDeCodigo(e.code)
        if (!n) return
        if (n === 'PrtSc' && !presionadas.includes(n)) presionadas.push(n) // Impr Pant solo avisa al soltar
        activas.delete(n)
        if (n === 'RAlt') activas.delete('Ctrl')
        if (!activas.size && presionadas.length) {
            const v = ordenar(presionadas).join('+')
            escuchando = false
            caja.blur()
            alCambiar(v)
        }
    })
    return caja
}

function inspectorPerilla(box, id) {
    const it = sel.item
    const propia = perfilSel().perillas?.[id]
    const global = cfg.perillas?.[id]
    box.append(el('h3', { text: PERILLAS[id] }), el('p', { class: 'sub', text: 'Girar a la izquierda / derecha y presionar' }))
    box.append(el('div', { class: 'campo' }, el('div', { class: 'seg' },
        el('button', { class: it.ambito === 'perfil' ? 'sel' : '', text: `Solo ${nombrePerfil(sel.perfil)}`, onclick: () => { it.ambito = 'perfil'; renderInspector() } }),
        el('button', { class: it.ambito === 'global' ? 'sel' : '', text: 'Todos los perfiles', onclick: () => { it.ambito = 'global'; renderInspector() } }))))

    const contenedor = () => it.ambito === 'global' ? (cfg.perillas ||= {}) : (perfilSel().perillas ||= {})
    const K = () => (it.ambito === 'global' ? cfg.perillas : perfilSel().perillas)?.[id]
    const k = K()

    if (it.ambito === 'perfil' && !propia) {
        if (global) {
            box.append(el('p', { class: 'info-campo', text: `En este perfil usa la de todos los perfiles: «${global.nombre}».` }),
                el('div', { class: 'pie' },
                    el('button', { class: 'btn', text: 'Cambiarla solo aquí', onclick: () => cambiar(() => { contenedor()[id] = JSON.parse(JSON.stringify(global)) }) }),
                    el('button', { class: 'btn', text: 'Editar la de todos', onclick: () => { it.ambito = 'global'; renderInspector() } })))
        } else {
            box.append(el('p', { class: 'info-campo', text: 'Esta perilla no hace nada en este perfil.' }),
                el('div', { class: 'pie' }, el('button', { class: 'btn primario', text: 'Darle una función', onclick: () => cambiar(() => { contenedor()[id] = { nombre: 'Perilla', girar: 'volumen', icono: 'volume' } }) })))
        }
        return
    }
    if (it.ambito === 'global' && !global) {
        box.append(el('p', { class: 'info-campo', text: 'No hay una función común para esta perilla.' }),
            el('div', { class: 'pie' }, el('button', { class: 'btn primario', text: 'Crear para todos los perfiles', onclick: () => cambiar(() => { contenedor()[id] = { nombre: 'Volumen', girar: 'volumen', icono: 'volume' } }) })))
        return
    }
    if (it.ambito === 'global') box.append(el('p', { class: 'aviso-campo', text: 'Cambia en todos los perfiles que no tengan una propia.' }))

    box.append(campo('Nombre', el('input', { class: 'entrada', value: k.nombre || '', maxlength: '14', oninput: e => cambiar(() => { K().nombre = e.target.value }, { clave: 'kn' + id, parcial: true }) })))
    box.append(campo('Ícono', selectorIcono(K, n => cambiar(() => { if (n) K().icono = n; else delete K().icono }, { parcial: true }))))

    const giro = typeof k.girar === 'string' ? k.girar : k.girar ? 'teclas' : 'nada'
    const opcionesGiro = [['nada', 'Nada'], ['volumen', 'Volumen'], ['pistas', 'Canciones'], ['brillo', 'Brillo'], ['teclas', 'Teclas']]
    box.append(campo('Al girar', el('div', { class: 'seg' }, ...opcionesGiro.map(([v, t]) => el('button', {
        class: giro === v ? 'sel' : '', text: t,
        onclick: () => cambiar(() => {
            if (v === 'nada') delete K().girar
            else if (v === 'teclas') K().girar = { izquierda: { tipo: 'tecla', teclas: '', mantenerMs: 60 }, derecha: { tipo: 'tecla', teclas: '', mantenerMs: 60 } }
            else K().girar = v
        }),
    })))))
    if (giro === 'teclas') {
        for (const lado of ['izquierda', 'derecha']) {
            box.append(el('span', { class: 'l', style: 'display:block;font-size:12px;color:var(--suave);margin-bottom:6px;font-weight:600', text: lado === 'izquierda' ? '↺ Hacia la izquierda' : '↻ Hacia la derecha' }),
                campoTeclas(k.girar[lado]?.teclas || '', v => cambiar(() => { K().girar[lado] = { tipo: 'tecla', teclas: v, mantenerMs: 60 } }, { parcial: true })))
        }
    }
    const cP = campo('Al presionarla')
    editorAccion(cP, () => K().presionar, (a, op) => cambiar(() => { if (a === undefined) return; if (a) K().presionar = a; else delete K().presionar }, op), { tipos: ['tecla', 'media', 'escribir', 'abrir', 'sonido', 'ninguna'] })
    box.append(cP)
    box.append(el('div', { class: 'pie' }, el('button', {
        class: 'btn chico peligro', text: it.ambito === 'global' ? 'Quitar de todos los perfiles' : (global ? 'Volver a la de todos' : 'Quitar'),
        onclick: () => cambiar(() => { delete contenedor()[id] }),
    })))
}

function inspectorPagina(box) {
    const ps = perfilSel().paginas
    const i = sel.pagina
    const P = () => perfilSel().paginas[sel.pagina]
    const pg = P()
    box.append(el('h3', { text: pg.nombre || 'Página' }), el('p', { class: 'sub', text: `Botón redondo ${i + 2} · ${nombrePerfil(sel.perfil)}` }))
    box.append(campo('Nombre', el('input', { class: 'entrada', value: pg.nombre || '', maxlength: '20', oninput: e => cambiar(() => { P().nombre = e.target.value }, { clave: 'pn', parcial: true }) })))
    box.append(campo('Color (luz del botón redondo)', selectorColor(pg.color, c => cambiar(() => { P().color = c }, { clave: 'pc', parcial: true }))))
    box.append(el('div', { class: 'campo' }, el('label', { class: 'cambiar' },
        el('input', { type: 'checkbox', checked: !!pg.visualizador, onchange: e => cambiar(() => { if (e.target.checked) P().visualizador = true; else delete P().visualizador }) }),
        'Página de música (portada y barras en la fila de abajo)')))
    box.append(el('div', { class: 'pie' },
        el('button', { class: 'btn chico', text: '← Mover', disabled: i === 0, onclick: () => cambiar(() => { [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; sel.pagina = i - 1 }) }),
        el('button', { class: 'btn chico', text: 'Mover →', disabled: i === ps.length - 1, onclick: () => cambiar(() => { [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; sel.pagina = i + 1 }) }),
        el('button', { class: 'btn chico', text: 'Duplicar', disabled: ps.length >= 5, onclick: () => cambiar(() => { const c = JSON.parse(JSON.stringify(P())); c.nombre += ' (copia)'; ps.splice(i + 1, 0, c); sel.pagina = i + 1 }) }),
        el('button', {
            class: 'btn chico peligro', text: 'Eliminar', disabled: ps.length <= 1,
            onclick: () => { if (confirm(`¿Eliminar la página «${pg.nombre}» y sus teclas?`)) cambiar(() => { ps.splice(i, 1); sel.pagina = Math.max(0, i - 1); sel.item = null }) },
        })))
}

// ================= copiar / pegar / vaciar =================
function copiar(i) {
    const t = paginaSel().teclas[i]
    if (!t) return
    portapapeles = JSON.parse(JSON.stringify(t)); guardarLocal('dp-portapapeles', portapapeles)
    avisar(`Copiada: ${t.texto || 'tecla'}`)
}
function pegar(i) {
    if (!portapapeles) return
    cambiar(() => { paginaSel().teclas[i] = JSON.parse(JSON.stringify(portapapeles)); sel.item = { tipo: 'tecla', i } })
}
function vaciar(i) { if (paginaSel().teclas[i]) cambiar(() => { paginaSel().teclas[i] = null }) }
function duplicar(i) {
    const ts = paginaSel().teclas, pg = paginaSel()
    const libre = ts.findIndex((t, j) => !t && !(pg.visualizador && j >= 7))
    if (libre < 0) { avisar('No hay espacio libre en esta página', 'mal'); return }
    cambiar(() => { ts[libre] = JSON.parse(JSON.stringify(ts[i])); sel.item = { tipo: 'tecla', i: libre } })
}

// ================= acciones con la PC =================
async function elegirArchivo(tipo, listo) {
    avisar('Elige el archivo en la ventana de Windows…')
    try { const r = await api('/api/elegir-archivo?tipo=' + tipo, { method: 'POST' }); if (r.ruta) listo(r.ruta) } catch { avisar('DeckPilot no responde', 'mal') }
}
async function probar(accion) {
    try { await api('/api/probar', { method: 'POST', body: JSON.stringify(accion) }) } catch { avisar('DeckPilot no responde', 'mal') }
}

// ================= ventanas emergentes =================
function abrirModal(titulo, contenido, { chica = false, pie = null, alCerrar = null } = {}) {
    const m = $('#modal'), caja = $('#modalCaja')
    caja.className = 'caja' + (chica ? ' chica' : '')
    caja.innerHTML = ''
    caja.append(el('header', {}, el('h3', { text: titulo }), el('button', { class: 'btn icono', text: '×', title: 'Cerrar (Esc)', onclick: cerrarModal })),
        el('div', { class: 'contenido' }, contenido))
    if (pie) caja.append(el('footer', {}, pie))
    m.hidden = false
    m.onclick = e => { if (e.target === m) cerrarModal() }
    modalAbierto = { alCerrar }
}
let modalAbierto = null
function cerrarModal() { $('#modal').hidden = true; $('#modalCaja').innerHTML = ''; modalAbierto?.alCerrar?.(); modalAbierto = null }

// galeria de iconos con buscador (en espanol o ingles)
const SINONIMOS = {
    luz: 'bulb light lamp', luces: 'bulb light', faro: 'bulb light car', mapa: 'map', punto: 'map-pin pin location', coordenada: 'map-pin location gps',
    ubicacion: 'location map-pin gps', volumen: 'volume', musica: 'music', cancion: 'music disc', camara: 'camera', foto: 'photo camera', captura: 'screenshot camera',
    video: 'video movie', grabar: 'player-record record', pausa: 'player-pause pause', play: 'player-play', siguiente: 'player-track-next', anterior: 'player-track-prev',
    coche: 'car', auto: 'car', carro: 'car', volante: 'steering-wheel wheel', rueda: 'wheel tire', motor: 'engine', gasolina: 'gas-station', freno: 'brake disc',
    flecha: 'arrow', arriba: 'arrow-up', abajo: 'arrow-down', izquierda: 'arrow-left', derecha: 'arrow-right', casa: 'home', inicio: 'home',
    carpeta: 'folder', archivo: 'file', buscar: 'search', ajustes: 'settings adjustments', configuracion: 'settings', basura: 'trash', borrar: 'trash eraser backspace',
    copiar: 'copy', pegar: 'clipboard', cortar: 'cut scissors', deshacer: 'arrow-back-up', guardar: 'device-floppy', nube: 'cloud', correo: 'mail',
    mensaje: 'message', chat: 'message', usuario: 'user', jugador: 'user users', amigos: 'users friends', corazon: 'heart', estrella: 'star', rayo: 'bolt',
    fuego: 'flame', mano: 'hand', ojo: 'eye', ocultar: 'eye-off', candado: 'lock', llave: 'key', reloj: 'clock', tiempo: 'clock', calendario: 'calendar',
    teclado: 'keyboard', raton: 'mouse', pantalla: 'device-desktop screen maximize', monitor: 'device-desktop chart', telefono: 'phone', audifonos: 'headphones',
    auriculares: 'headphones', microfono: 'microphone', silencio: 'volume-3 microphone-off', mudo: 'volume-3', altavoz: 'speakerphone volume', juego: 'device-gamepad',
    control: 'device-gamepad', mando: 'device-gamepad', espada: 'sword', escudo: 'shield', arco: 'bow', mochila: 'backpack', inventario: 'package box',
    caja: 'box package', cofre: 'box package', pico: 'pick', herramienta: 'tool', martillo: 'hammer', comida: 'meat apple', manzana: 'apple', planta: 'plant',
    arbol: 'tree', montana: 'mountain', mundo: 'world globe', tierra: 'world', sol: 'sun', luna: 'moon', noche: 'moon', dia: 'sun', lluvia: 'cloud-rain',
    trofeo: 'trophy', logro: 'trophy award', medalla: 'medal award', bandera: 'flag', meta: 'flag', velocidad: 'gauge', rendimiento: 'chart gauge', grafica: 'chart',
    dinero: 'coin cash', tienda: 'shopping-cart', carrito: 'shopping-cart', limpiaparabrisas: 'wiper', limpia: 'wiper', claxon: 'speakerphone', bocina: 'speakerphone',
    pit: 'tool', boxes: 'tool', intermitente: 'arrow-big-left arrow-big-right', emergencia: 'alert-triangle', alerta: 'alert-triangle', info: 'info-circle',
    ayuda: 'help', pregunta: 'help', cerrar: 'x', salir: 'logout door-exit', puerta: 'door', mas: 'plus', menos: 'minus', zoom: 'zoom-in', brillo: 'brightness',
    navegador: 'world browser', pestana: 'browser app-window', ventana: 'app-window', terminal: 'terminal', codigo: 'code', robot: 'robot', ia: 'robot sparkles',
    magia: 'sparkles wand', shader: 'sparkles', bicho: 'bug', depurar: 'bug', red: 'network wifi', wifi: 'wifi', bateria: 'battery', energia: 'bolt battery',
    lista: 'list', capa: 'stack', fila: 'list', huevo: 'egg', pokemon: 'pokeball', pokebola: 'pokeball', dron: 'drone', avion: 'plane', bici: 'bike', moto: 'motorbike',
}
function buscarIconos(q) {
    const qs = normal(q).trim()
    const nombres = Object.keys(ICONOS)
    if (!qs) return nombres
    const terminos = new Set(qs.split(/\s+/))
    for (const t of [...terminos]) for (const [es, en] of Object.entries(SINONIMOS)) if (es.startsWith(t) && t.length >= 3) en.split(' ').forEach(x => terminos.add(x))
    const res = []
    for (const n of nombres) {
        const tags = ICONOS[n][1] || ''
        let p = 0
        for (const t of terminos) {
            if (n === t) p = Math.max(p, 100)
            else if (n.startsWith(t)) p = Math.max(p, 60)
            else if (n.includes(t)) p = Math.max(p, 40)
            else if (tags.includes(t)) p = Math.max(p, 20)
        }
        if (p) res.push([p, n])
    }
    return res.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length).map(x => x[1])
}
function iconosUsados() {
    const s = new Set()
    for (const p of Object.values(cfg.perfiles)) {
        for (const pg of p.paginas) for (const t of pg.teclas) if (t?.icono && t.icono !== 'app') s.add(t.icono)
        for (const k of Object.values(p.perillas || {})) if (k?.icono) s.add(k.icono)
    }
    return [...s].filter(n => ICONOS[n])
}
function galeria(actual, elegir) {
    const buscador = el('input', { class: 'entrada', placeholder: 'Buscar en español o inglés: mapa, luz, coche, music…', autofocus: true })
    const res = el('div')
    let lista = [], mostrados = 0
    const celda = n => el('div', { class: 'gi' + (n === actual ? ' sel' : ''), title: n, onclick: () => { elegir(n); cerrarModal() } }, svgEl(n, ''), n)
    const sentinela = el('div', { style: 'height:1px' })
    const obs = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) mas() }, { root: null })
    let grid
    const mas = () => {
        const frag = document.createDocumentFragment()
        for (const n of lista.slice(mostrados, mostrados + 200)) frag.append(celda(n))
        mostrados += 200
        grid.append(frag)
    }
    const filtrar = () => {
        res.innerHTML = ''
        const q = buscador.value
        if (!q.trim()) {
            const usados = iconosUsados()
            if (usados.length) { res.append(el('div', { class: 'secc', text: 'Usados en DeckPilot' })); const g = el('div', { class: 'galeria' }); usados.forEach(n => g.append(celda(n))); res.append(g) }
            res.append(el('div', { class: 'secc', text: `Todos (${Object.keys(ICONOS).length})` }))
        }
        lista = buscarIconos(q)
        mostrados = 0
        grid = el('div', { class: 'galeria' })
        res.append(grid)
        if (!lista.length) res.append(el('p', { class: 'info-campo', text: 'Nada con ese nombre. Prueba en inglés o con otra palabra.' }))
        mas()
        res.append(sentinela)
        obs.observe(sentinela)
    }
    let t
    buscador.addEventListener('input', () => { clearTimeout(t); t = setTimeout(filtrar, 90) })
    buscador.addEventListener('keydown', e => { if (e.key === 'Enter' && lista[0]) { elegir(lista[0]); cerrarModal() } })
    filtrar()
    abrirModal('Elegir ícono', el('div', {}, el('div', { style: 'position:sticky;top:0;background:var(--panel);padding-bottom:10px;z-index:2' }, buscador), res), { alCerrar: () => obs.disconnect() })
    setTimeout(() => buscador.focus(), 30)
}

// asignar programas a un perfil
async function modalProgramas() {
    const k = sel.perfil
    const buscador = el('input', { class: 'entrada', placeholder: 'Nombre del proceso (ej. javaw, acs, chrome)…' })
    const cont = el('div')
    let abiertas = null
    const fila = (proceso, detalle) => {
        const otro = perfilDeProceso(proceso)
        return el('div', { class: 'item', onclick: () => { agregarProceso(k, proceso); cerrarModal(); avisar(`${proceso} → ${nombrePerfil(k)}`) } },
            el('b', { text: proceso }),
            otro === k ? el('span', { class: 'pastilla', style: 'background:#00e676', text: 'ya está' }) : otro ? el('span', { class: 'etq', text: `(ahora en ${nombrePerfil(otro)})` }) : null,
            detalle ? el('span', { class: 'd', text: detalle }) : null)
    }
    const pintar = () => {
        cont.innerHTML = ''
        const q = normal(buscador.value).replace(/\.exe$/, '').trim()
        const ignorar = new Set((cfg.ignorar || []).map(normal))
        const filtra = p => !ignorar.has(p) && (!q || p.includes(q))
        if (q) cont.append(el('div', { class: 'lista' }, fila(q, 'agregar este nombre')))
        const rec = (vivo.recientes || []).filter(filtra)
        if (rec.length) cont.append(el('div', { class: 'secc', text: 'Los que usaste hace poco' }), el('div', { class: 'lista' }, ...rec.map(p => fila(p))))
        cont.append(el('div', { class: 'secc', text: 'Ventanas abiertas ahora' }))
        if (!abiertas) cont.append(el('p', { class: 'info-campo', text: 'Buscando…' }))
        else {
            const ab = abiertas.filter(v => filtra(v.proceso))
            cont.append(ab.length ? el('div', { class: 'lista' }, ...ab.map(v => fila(v.proceso, v.titulo))) : el('p', { class: 'info-campo', text: 'Nada que coincida.' }))
        }
        cont.append(el('p', { class: 'info-campo', text: 'Tip: abre el juego o programa, vuelve aquí y aparecerá en «hace poco».' }))
    }
    buscador.addEventListener('input', pintar)
    buscador.addEventListener('keydown', e => { if (e.key === 'Enter' && buscador.value.trim()) { agregarProceso(k, buscador.value); cerrarModal() } })
    pintar()
    abrirModal(`Programas que activan «${nombrePerfil(k)}»`, el('div', {}, buscador, cont), { chica: true })
    setTimeout(() => buscador.focus(), 30)
    try { abiertas = await api('/api/ventanas') } catch { abiertas = [] }
    if (!$('#modal').hidden) pintar()
}

function modalNuevoPerfil() {
    const nombre = el('input', { class: 'entrada', placeholder: 'ej. Forza, OBS, Photoshop…' })
    const base = el('select', { class: 'entrada' }, el('option', { value: '', text: 'Vacío' }), ...Object.keys(cfg.perfiles).map(k => el('option', { value: k, text: 'Copia de ' + nombrePerfil(k) })))
    const crear = () => {
        const n = nombre.value.trim()
        if (!n) { nombre.focus(); return }
        let clave = normal(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil'
        while (cfg.perfiles[clave]) clave += '-2'
        cambiar(() => {
            const p = base.value ? JSON.parse(JSON.stringify(cfg.perfiles[base.value])) : { paginas: [{ nombre: 'Principal', color: '#2979ff', teclas: Array(12).fill(null) }] }
            p.nombre = n
            cfg.perfiles[clave] = p
            sel = { perfil: clave, pagina: 0, item: null }
        })
        cerrarModal()
        modalProgramas()
    }
    nombre.addEventListener('keydown', e => { if (e.key === 'Enter') crear() })
    abrirModal('Nuevo perfil', el('div', {}, campo('Nombre', nombre), campo('Empezar con', base)),
        { chica: true, pie: el('button', { class: 'btn primario', text: 'Crear', onclick: crear }) })
    setTimeout(() => nombre.focus(), 30)
}

function modalAjustes() {
    const num = (etq, clave, def, min, max, step = 1, ayuda) => campo(etq, el('input', {
        class: 'entrada', type: 'number', min: String(min), max: String(max), step: String(step), value: cfg[clave] ?? def,
        oninput: e => cambiar(() => { const v = Number(e.target.value); if (!isNaN(v)) cfg[clave] = Math.min(max, Math.max(min, v)) }, { clave: 'aj' + clave, parcial: true }),
    }), ayuda ? el('div', { class: 'info-campo', text: ayuda }) : null)
    const ign = el('div', { class: 'chips' })
    const pintarIgn = () => {
        ign.innerHTML = ''
        for (const p of cfg.ignorar || []) ign.append(el('span', { class: 'chip' }, p, el('button', { text: '×', onclick: () => { cambiar(() => { cfg.ignorar = cfg.ignorar.filter(x => x !== p) }, { parcial: true }); pintarIgn() } })))
    }
    pintarIgn()
    const nuevoIgn = el('input', {
        class: 'entrada', placeholder: 'Agregar proceso y Enter',
        onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = normal(e.target.value).replace(/\.exe$/, '').trim(); cambiar(() => { cfg.ignorar = [...new Set([...(cfg.ignorar || []), v])] }, { parcial: true }); e.target.value = ''; pintarIgn() } },
    })
    const brillo = el('input', {
        type: 'range', min: '0.1', max: '1', step: '0.05', value: cfg.brillo ?? 0.8, style: 'width:100%',
        oninput: e => cambiar(() => { cfg.brillo = Number(e.target.value) }, { clave: 'brillo', parcial: true }),
    })
    const contenido = el('div', {},
        campo('Nombre en la pantalla de inicio', el('input', { class: 'entrada', value: cfg.nombre || 'DeckPilot', maxlength: '20', oninput: e => cambiar(() => { cfg.nombre = e.target.value }, { clave: 'ajn', parcial: true }) })),
        campo('Perfil principal (botón Home)', el('select', { class: 'entrada', onchange: e => cambiar(() => { cfg.perfilPorDefecto = e.target.value }, { parcial: true }) },
            ...Object.keys(cfg.perfiles).map(k => el('option', { value: k, text: nombrePerfil(k), selected: k === cfg.perfilPorDefecto })))),
        campo('Brillo de la tableta', brillo),
        el('div', { class: 'campo' }, el('label', { class: 'cambiar' }, el('input', { type: 'checkbox', checked: cfg.etiquetas !== false, onchange: e => cambiar(() => { cfg.etiquetas = e.target.checked }, { parcial: true }) }), 'Mostrar el nombre debajo del ícono')),
        num('Tiempo que se mantiene cada tecla (ms)', 'mantenerTeclaMs', 90, 0, 1000, 10, 'Súbelo si algún juego no detecta los toques.'),
        num('Paso del volumen por clic de perilla (%)', 'pasoVolumen', 2, 1, 20),
        num('Duración de la animación de inicio (ms)', 'duracionInicioMs', 4000, 0, 15000, 500),
        campo('Programas que NO cambian el perfil', ign, el('div', { style: 'margin-top:8px' }, nuevoIgn),
            el('div', { class: 'info-campo', text: 'Al cambiar a estos (escritorio, menú inicio…) la tableta se queda como estaba.' })))
    abrirModal('Ajustes', contenido, { chica: true, alCerrar: render })
}

async function modalRespaldos() {
    const cont = el('div', {}, el('p', { class: 'info-campo', text: 'Cada vez que guardas se hace una copia automática (se guardan las últimas 40).' }))
    abrirModal('Respaldos', cont, { chica: true })
    let lista = []
    try { lista = await api('/api/respaldos') } catch { }
    if (!lista.length) { cont.append(el('p', { text: 'Todavía no hay respaldos. Se crean al guardar.' })); return }
    const fmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })
    cont.append(el('div', { class: 'lista' }, ...lista.map(r => el('div', { class: 'item' },
        el('span', { text: fmt.format(new Date(r.t)) }),
        el('button', {
            class: 'btn chico', style: 'margin-left:auto', text: 'Restaurar',
            onclick: async () => {
                if (!confirm('¿Volver a como estaba en ese momento? (lo actual también queda respaldado)')) return
                const res = await api('/api/restaurar?nombre=' + encodeURIComponent(r.nombre), { method: 'POST' }).catch(() => ({ ok: false, error: 'sin respuesta' }))
                if (!res.ok) { avisar('No se pudo: ' + res.error, 'mal'); return }
                await cargar(); historial = []; futuro = []; cerrarModal(); avisar('Restaurado', 'bien')
            },
        })))))
}

// ================= estado en vivo =================
async function consultarEstado() {
    if (document.hidden) return
    const caja = $('#estado')
    try {
        vivo = await api('/api/estado')
        caja.className = 'estado ' + (vivo.conectado ? 'on' : 'off')
        const donde = vivo.modo === 'mezcla' ? 'Mezclador' : vivo.modo === 'monitor' ? 'Monitor' : `${nombrePerfil(vivo.perfil)} › ${cfg.perfiles[vivo.perfil]?.paginas[vivo.pagina]?.nombre || ''}`
        caja.lastChild.textContent = vivo.conectado ? `En la tableta: ${donde}` : 'Tableta desconectada (DeckPilot sigue abierto)'
    } catch {
        vivo = {}
        caja.className = 'estado off'
        caja.lastChild.textContent = 'DeckPilot está cerrado: los cambios no se pueden guardar'
    }
    renderPerfiles(); renderPestanas()
}

// ================= arranque =================
async function cargar() {
    cfg = normalizar(await api('/api/config'))
    if (!sel.perfil || !cfg.perfiles[sel.perfil]) sel.perfil = cfg.perfilPorDefecto in cfg.perfiles ? cfg.perfilPorDefecto : Object.keys(cfg.perfiles)[0]
    acomodarSeleccion()
    sucio = false
    render()
}

function conectarBotones() {
    $('#bGuardar').onclick = guardar
    $('#bDeshacer').onclick = deshacer
    $('#bRehacer').onclick = rehacer
    $('#bAjustes').onclick = modalAjustes
    $('#bRespaldos').onclick = modalRespaldos
    $('#bNuevoPerfil').onclick = modalNuevoPerfil
    $('#bAgregarPrograma').onclick = modalProgramas
    $('#bPrincipal').onclick = () => cambiar(() => { cfg.perfilPorDefecto = sel.perfil })
    $('#bDuplicarPerfil').onclick = () => {
        let clave = sel.perfil + '-copia'
        while (cfg.perfiles[clave]) clave += '-2'
        cambiar(() => { const p = JSON.parse(JSON.stringify(perfilSel())); p.nombre = nombrePerfil(sel.perfil) + ' (copia)'; cfg.perfiles[clave] = p; sel = { perfil: clave, pagina: 0, item: null } })
    }
    $('#bBorrarPerfil').onclick = () => {
        const k = sel.perfil
        if (k === cfg.perfilPorDefecto) return
        if (!confirm(`¿Eliminar el perfil «${nombrePerfil(k)}»? Sus programas volverán al perfil principal.`)) return
        cambiar(() => { delete cfg.perfiles[k]; cfg.reglas = cfg.reglas.filter(r => r.perfil !== k); sel = { perfil: cfg.perfilPorDefecto, pagina: 0, item: null } })
    }
    const np = $('#nombrePerfil')
    np.oninput = () => cambiar(() => { perfilSel().nombre = np.value }, { clave: 'np', parcial: true })
    np.onkeydown = e => { if (e.key === 'Enter') np.blur() }

    // interruptor "mostrar en la tableta"
    const tg = el('label', { class: 'cambiar', title: 'La tableta muestra el perfil y la página que estás editando' },
        el('input', { type: 'checkbox', checked: reflejar, onchange: e => { reflejar = e.target.checked; guardarLocal('dp-reflejar', reflejar); mostrarEnTableta() } }), 'Ver en la tableta')
    $('.acciones').prepend(tg)

    document.addEventListener('keydown', e => {
        const enCampo = e.target.closest?.('input, textarea, select, .captura')
        const ctrl = e.ctrlKey || e.metaKey
        if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); return }
        if (e.key === 'Escape' && !$('#modal').hidden) { cerrarModal(); return }
        if (enCampo || !$('#modal').hidden) return
        if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer() }
        else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer() }
        else if (sel.item?.tipo === 'tecla') {
            const i = sel.item.i
            if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copiar(i) }
            else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pegar(i) }
            else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); vaciar(i) }
            else if (e.key.startsWith('Arrow')) {
                e.preventDefault()
                const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]
                const n = i + d
                if (n >= 0 && n < 12) { sel.item = { tipo: 'tecla', i: n }; renderTableta(); renderInspector() }
            } else if (e.key === 'Escape') { sel.item = null; renderTableta(); renderInspector() }
        }
    })
    window.addEventListener('beforeunload', e => { if (sucio) { e.preventDefault(); e.returnValue = '' } })
    document.addEventListener('visibilitychange', () => { if (!document.hidden) consultarEstado() })
}

async function iniciar() {
    conectarBotones()
    try {
        const [ic] = await Promise.all([api('/api/iconos'), cargar()])
        ICONOS = ic
        render()
    } catch (e) {
        $('#inspector').innerHTML = '<div class="vacioInsp"><div class="grande">⚠️</div><p>No pude hablar con DeckPilot. Ábrelo desde el acceso directo y recarga esta página.</p></div>'
        return
    }
    navigator.keyboard?.getLayoutMap?.().then(m => { mapaTeclado = m; render() }).catch(() => {})
    consultarEstado()
    setInterval(consultarEstado, 2500)
    mostrarEnTableta()
}
iniciar()
