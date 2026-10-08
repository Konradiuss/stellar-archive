import { afterEach, describe, expect, it } from 'vitest'
import { createDosShell } from '../dosShell'
import { DOS_SCRIPT, parseDosScript } from '../../data/dosScript'
import { setStrings } from '../../i18n'

const texts = result => result.lines.map(line => line.text)

function scriptOutput(command) {
  const at = DOS_SCRIPT.findIndex(line => line.type === 'prompt' && line.command === command)
  const end = DOS_SCRIPT.findIndex((line, index) => index > at && line.type === 'prompt')
  return DOS_SCRIPT.slice(at + 1, end < 0 ? undefined : end).map(line => line.text)
}

describe('the DOS shell behind the windows', () => {
  it('lists its commands in HELP, and says more of one', () => {
    const shell = createDosShell()
    const help = texts(shell.run('help'))
    expect(help[0]).toBe('For more information on a specific command, type HELP command-name')
    for (const name of ['CD', 'CLS', 'DIR', 'ECHO', 'EXIT', 'MEM', 'TYPE', 'VER']) {
      expect(help.some(line => line.startsWith(`${name} `))).toBe(true)
    }
    expect(help.at(-1)).toBe('Programs: type the name of any .EXE or .COM file that DIR shows.')
    expect(texts(shell.run('HELP dir'))).toEqual(['DIR: Displays a list of files and subdirectories in a directory.'])
    expect(texts(shell.run('help format'))).toEqual(['Help not available for this command - FORMAT'])
  })

  it('shows the file nobody should run in C:\\ and a note about it', () => {
    const shell = createDosShell()
    expect(shell.prompt).toBe('C:\\>')
    const listing = texts(shell.run('dir'))
    expect(listing).toContain(' Directory of C:\\')
    expect(listing.join('\n')).toMatch(/README\.TXT\s+SYNDICATE\.EXE/)
    expect(listing.join('\n')).toMatch(/\[SYSTEM\]/)
    expect(texts(shell.run('type readme.txt'))).toContain('When you are ready, run SYNDICATE.EXE.')
    expect(texts(shell.run('type nothing.txt'))).toEqual(['File not found - NOTHING.TXT'])
  })

  it('moves between directories and drives as DOS does', () => {
    const shell = createDosShell()
    expect(shell.run('cd system').lines).toEqual([])
    expect(shell.prompt).toBe('C:\\SYSTEM>')
    expect(texts(shell.run('DIR /W'))).toEqual(scriptOutput('dir /w'))
    shell.run('cd ..')
    expect(shell.prompt).toBe('C:\\>')
    shell.run('cd \\network\\config')
    expect(shell.prompt).toBe('C:\\NETWORK\\CONFIG>')
    shell.run('cd\\')
    expect(shell.prompt).toBe('C:\\>')
    expect(texts(shell.run('cd nowhere'))).toEqual(['Invalid directory'])
    shell.run('cd aicore')
    shell.run('d:')
    expect(shell.prompt).toBe('D:\\>')
    shell.run('cd sensors')
    shell.run('C:')
    expect(shell.prompt).toBe('C:\\AICORE>')
    shell.run('d:')
    expect(shell.prompt).toBe('D:\\SENSORS>')
    expect(texts(shell.run('z:'))).toEqual(['Invalid drive specification'])
    expect(texts(shell.run('cd'))).toEqual(['D:\\SENSORS'])
    shell.setPrompt('E:\\BACKUP\\LOGS>')
    expect(shell.prompt).toBe('E:\\BACKUP\\LOGS>')
  })

  it('answers the commands of the script as the script does, whatever the case', () => {
    const shell = createDosShell()
    expect(texts(shell.run('mem'))).toEqual(scriptOutput('mem'))
    expect(texts(shell.run('  SystemCheck.EXE  '))).toEqual(scriptOutput('systemcheck.exe'))
    expect(texts(shell.run('hwdiag'))).toEqual(scriptOutput('hwdiag.exe /full /verbose'))
    expect(shell.run('systemcheck.exe').lines.filter(line => line.type === 'loading').every(line => line.spinner)).toBe(true)
    expect(texts(shell.run('ping CONCORD-RING'))).toEqual(scriptOutput('ping CONCORD-RING'))
    expect(texts(shell.run('ping earth'))).toContain('Ping request could not find host EARTH.')
    expect(texts(shell.run('format c:'))).toEqual(['Bad command or file name'])
    expect(shell.run('   ').lines).toEqual([])
  })

  it('clears, quits and runs the file of the Syndicate from anywhere', () => {
    const shell = createDosShell()
    expect(shell.run('cls').action).toBe('cls')
    expect(shell.run('EXIT').action).toBe('exit')
    expect(texts(shell.run('ver'))).toContain('EXODUS STATION OS v1.18 - SOLAR CONCORD PORT AUTHORITY')
    expect(texts(shell.run('echo Hello Station'))).toEqual(['Hello Station'])
    expect(texts(shell.run('echo'))).toEqual(['ECHO is on.'])
    for (const command of ['syndicate.exe', 'SYNDICATE', 'c:\\syndicate.exe']) {
      const result = createDosShell().run(command)
      expect(result.action).toBe('syndicate')
      expect(texts(result)).toEqual(['', 'Loading SYNDICATE.EXE', 'Bypassing terminal security...', 'ACCESS GRANTED'])
    }
    shell.run('cd security')
    expect(shell.run('Syndicate.exe').action).toBe('syndicate')
  })
})

describe('the script of a map', () => {
  it('reads a screen of DOS: commands at their prompts, loading lines, output in the directory of the next prompt', () => {
    const script = parseDosScript('\ufeffORION OS 2.0\r\n\r\nC:\\>cd LOGS\r\nC:\\LOGS>type today.log\r\n~Reading\r\nAll quiet.\r\nC:\\>\r\n')
    expect(script).toEqual([
      { command: '', text: 'ORION OS 2.0', type: 'text', path: 'C:\\>' },
      { command: '', text: '', type: 'text', path: 'C:\\>' },
      { command: 'cd LOGS', text: 'C:\\>', type: 'prompt', path: 'C:\\>' },
      { command: 'type today.log', text: 'C:\\LOGS>', type: 'prompt', path: 'C:\\LOGS>' },
      { command: '', text: 'Reading', type: 'loading', spinner: true, path: 'C:\\LOGS>' },
      { command: '', text: 'All quiet.', type: 'text', path: 'C:\\LOGS>' },
      { command: '', text: 'C:\\>', type: 'text', path: 'C:\\LOGS>' }
    ])
    expect(parseDosScript('')).toEqual([])
    expect(parseDosScript('just text').map(line => line.path)).toEqual(['C:\\>'])
  })

  it('types the built-in one with a prompt at each command', () => {
    expect(DOS_SCRIPT.length).toBeGreaterThan(400)
    expect(DOS_SCRIPT[0].text).toBe('EXODUS STATION OS v1.18 - SOLAR CONCORD PORT AUTHORITY')
    const prompts = DOS_SCRIPT.filter(line => line.type === 'prompt')
    expect(prompts.length).toBeGreaterThan(40)
    expect(prompts.every(line => line.command && line.text === line.path)).toBe(true)
    expect(DOS_SCRIPT.filter(line => line.type === 'loading').every(line => line.spinner)).toBe(true)
  })

  it('answers as the script of the map does, with its name and its volume', () => {
    const script = parseDosScript([
      'ORION OS 2.0',
      'C:\\>dir',
      '',
      ' Volume in drive C is ORION',
      ' Directory of C:\\',
      'C:\\>cd F:\\VAULT',
      'F:\\VAULT>scan',
      'Nothing here.',
      'F:\\VAULT>'
    ].join('\n'))
    const shell = createDosShell({ script })
    expect(texts(shell.run('ver'))).toEqual(['', 'ORION OS 2.0', ''])
    expect(texts(shell.run('dir')).slice(0, 4)).toEqual(['', ' Volume in drive C is ORION', '', ' Directory of C:\\'])
    expect(texts(shell.run('scan'))).toEqual(['Nothing here.', 'F:\\VAULT>'])
    expect(shell.run('f:').lines).toEqual([])
    expect(shell.prompt).toBe('F:\\>')
    expect(texts(shell.run('d:'))).toEqual(['Invalid drive specification'])
    expect(texts(createDosShell({ script: parseDosScript('C:\\>mem\nok') }).run('dir')).slice(0, 2)).toEqual(['', ' Directory of C:\\'])
  })

  // Was: a map script in small letters ('c:\Users>') gave "Invalid directory" for the very paths it showed: CD looked for capitals.
  it('finds the directories of a script written in small letters', () => {
    const shell = createDosShell({ script: parseDosScript('c:\\>cd users\nc:\\users>dir\n Directory of c:\\users\n [.] [..]\nd:\\logs>ver') })
    expect(texts(shell.run('cd \\users'))).toEqual([])
    expect(shell.prompt).toBe('C:\\USERS>')
    expect(texts(shell.run('dir'))).toEqual([' Directory of c:\\users', ' [.] [..]'])
    expect(texts(shell.run('d:'))).toEqual([])
    expect(texts(shell.run('cd \\logs'))).toEqual([])
  })

  it('keeps the files of the map in C:\\, over a built-in one of the same name', () => {
    const files = new Map([['NOTES.TXT', ['Day 1.', 'Day 2: они здесь.']], ['README.TXT', ['Mine now.']]])
    const shell = createDosShell({ files })
    const listing = texts(shell.run('dir')).join('\n')
    expect(listing).toMatch(/NOTES\.TXT\s+README\.TXT\s+SYNDICATE\.EXE/)
    expect(listing).toMatch(/6 file\(s\) {4}722,051 bytes/)
    expect(texts(shell.run('type notes.txt'))).toEqual(['', 'Day 1.', 'Day 2: они здесь.', ''])
    expect(texts(shell.run('TYPE C:\\README.TXT'))).toEqual(['', 'Mine now.', ''])
    expect(texts(shell.run('type autoexec.bat'))).toContain('@ECHO OFF')
    shell.run('cd system')
    expect(texts(shell.run('type notes.txt'))).toEqual(['File not found - NOTES.TXT'])
    expect(texts(shell.run('type \\notes.txt'))).toContain('Day 1.')
  })

  it('has no SYNDICATE.EXE, nor the note about it, when the map says so', () => {
    const shell = createDosShell({ syndicate: false })
    const listing = texts(shell.run('dir')).join('\n')
    expect(listing).not.toMatch(/SYNDICATE|README/)
    expect(listing).toMatch(/AUTOEXEC\.BAT\s+COMMAND\.COM\s+CONFIG\.SYS/)
    for (const command of ['syndicate.exe', 'SYNDICATE', 'c:\\syndicate.exe']) {
      expect(shell.run(command)).toEqual({ lines: [{ type: 'text', text: 'Bad command or file name' }], action: null, beep: true })
    }
    expect(texts(shell.run('type readme.txt'))).toEqual(['File not found - README.TXT'])
  })
})

describe('the errors of the shell', () => {
  it('are marked to beep, the answers are not', () => {
    const shell = createDosShell()
    for (const command of ['foo', 'cd nowhere', 'q:', 'type', 'type nothing.txt', 'ping mars', 'telnet mars']) {
      expect(shell.run(command).beep, command).toBe(true)
    }
    for (const command of ['dir', 'ver', 'help', 'echo hi', 'cd', '']) {
      expect(shell.run(command).beep, command).toBeUndefined()
    }
  })
})

describe('the shell in the language of the map', () => {
  afterEach(() => setStrings())

  it('says what it says in the texts of the interface', () => {
    setStrings({
      'dos.badCommand': 'Неверная команда',
      'dos.noFile': 'Файл не найден: {file}',
      'dos.helpDir': 'Список файлов.',
      'dos.directoryOf': ' Содержимое {dir}',
      'dos.fileCount': { one: '{count} файл {bytes} байт', few: '{count} файла {bytes} байт', many: '{count} файлов {bytes} байт' },
      'dos.readme': 'ТОМУ, КТО НАЙДЁТ\nЗапусти {file}.',
      'dos.runGranted': 'ДОСТУП ОТКРЫТ'
    }, 'ru')
    const shell = createDosShell()
    expect(texts(shell.run('format c:'))).toEqual(['Неверная команда'])
    expect(texts(shell.run('type x.txt'))).toEqual(['Файл не найден: X.TXT'])
    expect(texts(shell.run('help dir'))).toEqual(['DIR: Список файлов.'])
    const listing = texts(shell.run('dir'))
    expect(listing).toContain(' Содержимое C:\\')
    expect(listing.find(line => line.includes('файл'))).toMatch(/^ {6}5 файлов 723\u00a0346 байт$/)
    expect(texts(shell.run('type readme.txt'))).toEqual(['', 'ТОМУ, КТО НАЙДЁТ', 'Запусти SYNDICATE.EXE.', ''])
    expect(texts(shell.run('syndicate')).at(-1)).toBe('ДОСТУП ОТКРЫТ')
  })
})
