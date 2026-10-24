// Servidor del editor visual de DeckPilot.
// - Solo escucha en esta PC (127.0.0.1). Nadie de afuera puede entrar.
// - No hace nada mientras no abras el editor: cero CPU en reposo.
// - Al guardar: respalda config.json, lo reemplaza y DeckPilot aplica los cambios al instante.

import http from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const MAX_RESPALDOS = 40

const PLANTILLA_SVG = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`
const interiorSvg = s => (s.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [, ''])[1]
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, '').replace(/\s*\n\s*/g, '')

export function iniciarEditor(op) {
    const { dir, puerto, log } = op
    const dirEditor = join(dir, 'editor')
    const dirIconos = join(dir, 'iconos')
    const dirRespaldos = join(dir, 'respaldos')
    const archivoConfig = join(dir, 'config.json')
    const cacheArchivos = new Map() // ruta -> { buf, gz, tipo, mtime }

    // iconos: todos los de Tabler + los propios de la carpeta iconos/ (se arma una sola vez, al abrir el editor)
    let iconosGz = null, iconosMapa = null
    function catalogoIconos() {
        if (iconosMapa) return iconosMapa
        iconosMapa = JSON.parse(readFileSync(join(dirEditor, 'tabler.json'), 'utf8'))
        for (const f of readdirSync(dirIconos)) {
            if (!f.endsWith('.svg')) continue
            const n = f.slice(0, -4)
            if (!iconosMapa[n]) { try { iconosMapa[n] = [interiorSvg(readFileSync(join(dirIconos, f), 'utf8')), 'propio'] } catch { } }
        }
        iconosGz = gzipSync(Buffer.from(JSON.stringify(iconosMapa)))
        return iconosMapa
    }
    // copia a iconos/ los que el config usa y todavia no estan (DeckPilot solo carga esa carpeta)
    function asegurarIconos(cfg) {
        const usados = new Set()
        const ver = t => { if (t?.icono && t.icono !== 'app') usados.add(t.icono); if (t?.icono_respaldo) usados.add(t.icono_respaldo) }
        for (const p of Object.values(cfg.perfiles || {})) {
            for (const pg of p.paginas || []) for (const t of pg.teclas || []) ver(t)
            for (const k of Object.values(p.perillas || {})) ver(k)
        }
        for (const k of Object.values(cfg.perillas || {})) ver(k)
        let nuevos = 0
        for (const n of usados) {
            if (!/^[a-z0-9-]+$/.test(n)) continue
            const ruta = join(dirIconos, n + '.svg')
            if (existsSync(ruta)) continue
            const ic = catalogoIconos()[n]
            if (ic) { writeFileSync(ruta, PLANTILLA_SVG(ic[0]), 'utf8'); nuevos++ }
        }
        return nuevos
    }

    function validar(cfg) {
        if (!cfg || typeof cfg !== 'object') return 'El archivo esta vacio'
        if (!cfg.perfiles || typeof cfg.perfiles !== 'object' || !Object.keys(cfg.perfiles).length) return 'Tiene que haber al menos un perfil'
        if (!cfg.perfiles[cfg.perfilPorDefecto]) return 'El perfil principal no existe'
        for (const [n, p] of Object.entries(cfg.perfiles)) {
            if (!Array.isArray(p.paginas) || !p.paginas.length) return `El perfil "${n}" necesita al menos una pagina`
            for (const pg of p.paginas) if (!Array.isArray(pg.teclas)) return `Pagina sin teclas en "${n}"`
        }
        for (const r of cfg.reglas || []) if (!cfg.perfiles[r.perfil]) return `Una regla apunta al perfil "${r.perfil}" que no existe`
        return null
    }

    function respaldar() {
        mkdirSync(dirRespaldos, { recursive: true })
        const d = new Date(), z = n => String(n).padStart(2, '0')
        const nombre = `config_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}.json`
        writeFileSync(join(dirRespaldos, nombre), readFileSync(archivoConfig))
        const todos = listaRespaldos()
        for (const r of todos.slice(MAX_RESPALDOS)) { try { unlinkSync(join(dirRespaldos, r.nombre)) } catch { } }
        return nombre
    }
    function listaRespaldos() {
        if (!existsSync(dirRespaldos)) return []
        return readdirSync(dirRespaldos).filter(f => /^config_.*\.json$/.test(f))
            .map(f => ({ nombre: f, t: statSync(join(dirRespaldos, f)).mtimeMs })).sort((a, b) => b.t - a.t)
    }

    async function guardar(cfg) {
        const error = validar(cfg)
        if (error) return { ok: false, error }
        const respaldo = respaldar()
        const nuevos = asegurarIconos(cfg)
        const tmp = archivoConfig + '.tmp'
        writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
        renameSync(tmp, archivoConfig) // reemplazo de un golpe: nunca queda un archivo a medias
        await op.aplicarConfig(cfg)
        log(`Editor: cambios guardados (respaldo ${respaldo}${nuevos ? `, ${nuevos} iconos nuevos` : ''})`)
        return { ok: true, respaldo }
    }

    function archivoEstatico(nombre) {
        const ruta = join(dirEditor, nombre)
        let st
        try { st = statSync(ruta) } catch { return null }
        const c = cacheArchivos.get(ruta)
        if (c && c.mtime === st.mtimeMs) return c
        const buf = readFileSync(ruta)
        const e = { buf, gz: gzipSync(buf), tipo: TIPOS[extname(ruta)] || 'application/octet-stream', mtime: st.mtimeMs }
        cacheArchivos.set(ruta, e)
        return e
    }

    function enviar(req, res, codigo, cuerpo, tipo = 'application/json; charset=utf-8', gz = null, extra = {}) {
        const aceptaGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
        const h = { 'Content-Type': tipo, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...extra }
        if (aceptaGz && gz) { h['Content-Encoding'] = 'gzip'; res.writeHead(codigo, h); res.end(gz); return }
        res.writeHead(codigo, h); res.end(cuerpo)
    }
    const json = (req, res, obj, codigo = 200) => enviar(req, res, codigo, JSON.stringify(obj))

    function leerCuerpo(req, max = 4e6) {
        return new Promise((ok, mal) => {
            let n = 0; const partes = []
            req.on('data', d => { n += d.length; if (n > max) { mal(new Error('Demasiado grande')); req.destroy() } else partes.push(d) })
            req.on('end', () => ok(Buffer.concat(partes).toString('utf8')))
            req.on('error', mal)
        })
    }

    // dialogo de Windows para elegir un archivo (programa, acceso directo o sonido)
    function elegirArchivo(filtro) {
        const filtros = {
            programa: 'Programas y accesos directos|*.exe;*.lnk;*.url;*.bat;*.cmd|Todos los archivos|*.*',
            sonido: 'Sonidos WAV|*.wav|Todos los archivos|*.*',
        }
        const f = filtros[filtro] || filtros.programa
        const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $w=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;WindowState='Minimized'}; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Filter='${f}'; $d.Title='DeckPilot - elige un archivo'; if($d.ShowDialog($w) -eq 'OK'){ $d.FileName }`
        return new Promise(ok => {
            const p = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
            let out = ''
            p.stdout.setEncoding('utf8'); p.stdout.on('data', d => out += d)
            p.on('exit', () => ok(out.trim() || null)); p.on('error', () => ok(null))
        })
    }

    // ventanas abiertas ahora (para asignar programas a un perfil)
    function ventanasAbiertas() {
        const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.ProcessName.ToLower() + '|' + $_.MainWindowTitle }`
        return new Promise(ok => {
            const p = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true })
            let out = ''
            p.stdout.setEncoding('utf8'); p.stdout.on('data', d => out += d)
            p.on('exit', () => {
                const vistos = new Map()
                for (const l of out.split(/\r?\n/)) { const i = l.indexOf('|'); if (i > 0) { const n = l.slice(0, i); if (!vistos.has(n)) vistos.set(n, l.slice(i + 1)) } }
                ok([...vistos].map(([proceso, titulo]) => ({ proceso, titulo })))
            })
            p.on('error', () => ok([]))
        })
    }

    const anfitrionesValidos = new Set([`127.0.0.1:${puerto}`, `localhost:${puerto}`])

    const servidor = http.createServer(async (req, res) => {
        try {
            // solo desde esta PC y desde el propio editor (bloquea paginas web que intenten usarlo)
            if (!anfitrionesValidos.has(req.headers.host)) { res.writeHead(403); res.end(); return }
            const url = new URL(req.url, `http://${req.headers.host}`)
            const ruta = url.pathname
            if (req.method !== 'GET' && req.headers['x-deckpilot'] !== '1') { res.writeHead(403); res.end(); return }

            if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
                const a = archivoEstatico('index.html'); return enviar(req, res, 200, a.buf, a.tipo, a.gz)
            }
            if (req.method === 'GET' && /^\/(app\.js|app\.css)$/.test(ruta)) {
                const a = archivoEstatico(ruta.slice(1)); return enviar(req, res, 200, a.buf, a.tipo, a.gz)
            }
            if (req.method === 'GET' && ruta === '/teclas.js') {
                // el mismo lector de teclas que usa DeckPilot, para validar igual en el editor
                const buf = readFileSync(join(dir, 'teclas.js'))
                return enviar(req, res, 200, buf, TIPOS['.js'])
            }
            if (req.method === 'GET' && ruta === '/logo.ico') {
                return enviar(req, res, 200, readFileSync(join(dir, 'deckpilot.ico')), TIPOS['.ico'], null, { 'Cache-Control': 'max-age=86400' })
            }
            if (req.method === 'GET' && ruta === '/api/iconos') {
                catalogoIconos()
                return enviar(req, res, 200, JSON.stringify(iconosMapa), TIPOS['.json'], iconosGz, { 'Cache-Control': 'max-age=3600' })
            }
            if (req.method === 'GET' && ruta === '/api/config') {
                return enviar(req, res, 200, readFileSync(archivoConfig, 'utf8'))
            }
            if (req.method === 'POST' && ruta === '/api/config') {
                let cfg
                try { cfg = JSON.parse(await leerCuerpo(req)) } catch { return json(req, res, { ok: false, error: 'Datos danados' }, 400) }
                return json(req, res, await guardar(cfg))
            }
            if (req.method === 'GET' && ruta === '/api/estado') return json(req, res, op.estado())
            if (req.method === 'POST' && ruta === '/api/mostrar') {
                op.mostrar(url.searchParams.get('perfil'), Number(url.searchParams.get('pagina')) || 0)
                return json(req, res, { ok: true })
            }
            if (req.method === 'GET' && ruta === '/api/ventanas') return json(req, res, await ventanasAbiertas())
            if (req.method === 'POST' && ruta === '/api/elegir-archivo') {
                return json(req, res, { ruta: await elegirArchivo(url.searchParams.get('tipo')) })
            }
            if (req.method === 'POST' && ruta === '/api/probar') {
                let accion
                try { accion = JSON.parse(await leerCuerpo(req, 1e5)) } catch { return json(req, res, { ok: false }, 400) }
                // solo acciones que tiene sentido probar desde la PC (abrir, sonido, multimedia)
                if (!['abrir', 'sonido', 'media'].includes(accion?.tipo)) return json(req, res, { ok: false })
                op.probar(accion)
                return json(req, res, { ok: true })
            }
            if (req.method === 'GET' && ruta === '/api/icono-app') {
                const png = await op.iconoApp(url.searchParams.get('ruta') || '')
                if (!png) { res.writeHead(404); res.end(); return }
                return enviar(req, res, 200, png, TIPOS['.png'], null, { 'Cache-Control': 'max-age=86400' })
            }
            if (req.method === 'GET' && ruta === '/api/respaldos') return json(req, res, listaRespaldos().map(r => ({ nombre: r.nombre, t: r.t })))
            if (req.method === 'POST' && ruta === '/api/restaurar') {
                const nombre = basename(url.searchParams.get('nombre') || '')
                const archivo = join(dirRespaldos, nombre)
                if (!/^config_.*\.json$/.test(nombre) || !existsSync(archivo)) return json(req, res, { ok: false, error: 'No existe ese respaldo' })
                let cfg
                try { cfg = JSON.parse(readFileSync(archivo, 'utf8')) } catch { return json(req, res, { ok: false, error: 'Respaldo danado' }) }
                return json(req, res, await guardar(cfg))
            }
            res.writeHead(404); res.end()
        } catch (e) {
            log('Editor: error', e.message)
            try { json(req, res, { ok: false, error: e.message }, 500) } catch { }
        }
    })
    servidor.on('error', e => log(e.code === 'EADDRINUSE' ? `Editor: el puerto ${puerto} esta ocupado` : `Editor: ${e.message}`))
    servidor.listen(puerto, '127.0.0.1', () => log(`Editor listo en http://127.0.0.1:${puerto}`))
    servidor.keepAliveTimeout = 5000
    return servidor
}
