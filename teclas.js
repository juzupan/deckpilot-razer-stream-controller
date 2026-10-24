// Convierte textos como "Alt+2", "Ctrl+Shift+T", "Alt+Num0", "F1", "Esc" en codigos de tecla de Windows (VK).

export const VK = {
    VOLUME_MUTE: 0xAD, VOLUME_DOWN: 0xAE, VOLUME_UP: 0xAF,
    MEDIA_NEXT: 0xB0, MEDIA_PREV: 0xB1, MEDIA_STOP: 0xB2, MEDIA_PLAY_PAUSE: 0xB3,
}

const NOMBRES = {
    CTRL: 0x11, CONTROL: 0x11, ALT: 0x12, SHIFT: 0x10, MAYUS: 0x10, WIN: 0x5B,
    ESC: 0x1B, ESCAPE: 0x1B, ENTER: 0x0D, INTRO: 0x0D, TAB: 0x09, SPACE: 0x20, ESPACIO: 0x20,
    BACKSPACE: 0x08, RETROCESO: 0x08,
    LEFT: 0x25, IZQUIERDA: 0x25, UP: 0x26, ARRIBA: 0x26, RIGHT: 0x27, DERECHA: 0x27, DOWN: 0x28, ABAJO: 0x28,
    INSERT: 0x2D, DELETE: 0x2E, SUPR: 0x2E, HOME: 0x24, INICIO: 0x24, END: 0x23, FIN: 0x23,
    PAGEUP: 0x21, PAGEDOWN: 0x22, SCROLLLOCK: 0x91,
    '+': 0xBB, PLUS: 0xBB, '=': 0xBB, '-': 0xBD, MINUS: 0xBD, ',': 0xBC, '.': 0xBE, '~': 0xC0, '/': 0xBF, SLASH: 0xBF,
    PAUSE: 0x13, NUMLOCK: 0x90, APPS: 0x5D, MENU: 0x5D,
    PRTSC: 0x2C, IMPRPANT: 0x2C, CAPSLOCK: 0x14, BLOQMAYUS: 0x14, RALT: 0xA5, ALTGR: 0xA5, RCTRL: 0xA3,
    'NUM+': 0x6B, 'NUM-': 0x6D,
    NUMMULT: 0x6A, NUMPLUS: 0x6B, NUMMINUS: 0x6D, NUMDOT: 0x6E, NUMDIV: 0x6F,
}

export function nombreAVk(nombre) {
    const n = nombre.trim().toUpperCase()
    if (NOMBRES[n] !== undefined) return NOMBRES[n]
    if (/^[A-Z]$/.test(n)) return n.charCodeAt(0)
    if (/^[0-9]$/.test(n)) return n.charCodeAt(0)
    let m = n.match(/^NUM([0-9])$/)
    if (m) return 0x60 + Number(m[1])
    m = n.match(/^F([0-9]{1,2})$/)
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) return 0x6F + Number(m[1])
    m = n.match(/^0X([0-9A-F]{1,2})$/)
    if (m) return parseInt(m[1], 16)
    // tecla por posicion fisica (scancode), ej. "SC:35" o "SC:E035": no depende del idioma del teclado
    m = n.match(/^SC:([0-9A-F]{1,4})$/)
    if (m) return 0x10000 + parseInt(m[1], 16)
    return undefined
}

// "Alt+2" -> [0x12, 0x32]. Devuelve null si alguna parte no se reconoce.
export function parseTeclas(texto) {
    // permite "Alt++" para la tecla +
    const partes = String(texto).replace(/\+\+$/, '+PLUS').split('+').filter(p => p !== '')
    const vks = partes.map(nombreAVk)
    return vks.some(v => v === undefined) || vks.length === 0 ? null : vks
}
