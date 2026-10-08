// 16 x 16 with an empty pixel round the edge; a letter per colour.

import { createSprite, setPixel, spriteToDataUri } from './pixelArt'

export const ICON_SIZE = 16

const ICONS = {
  star: {
    colors: { a: '#ffcf3a', b: '#ff9b1f', c: '#fff4c2' },
    rows: [
      '................',
      '................',
      '.......a........',
      '.......a........',
      '......aba.......',
      '......aba.......',
      '.....abcba......',
      '....abcccba.....',
      '.aaabbcccbbaaa..',
      '....abcccba.....',
      '.....abcba......',
      '......aba.......',
      '......aba.......',
      '.......a........',
      '.......a........',
      '................'
    ]
  },

  planet: {
    colors: { a: '#141414', b: '#ffe2b8', c: '#eaa860', d: '#a8642a', e: '#7a8498', f: '#c47c3a', g: '#f4f8ff', h: '#8a98b0' },
    rows: [
      '................',
      '................',
      '......aaaa......',
      '....aabbccaa....',
      '...abbbbcccdaaa.',
      '..abbcccccccdee.',
      '..afffffffffdgg.',
      '..abccccccccgha.',
      '.aecccccccggha..',
      '.eaccccggghhda..',
      '.gggggghhccdda..',
      '.ahhhhdddddda...',
      '..aaaaddddaa....',
      '......aaaa......',
      '................',
      '................'
    ]
  },

  moon: {
    colors: { a: '#141414', b: '#fffbe0', c: '#f0e6a8', d: '#b8a860', e: '#c8bc80' },
    rows: [
      '................',
      '.......aaaaa....',
      '.....aabbbbca...',
      '....abbcccda....',
      '...abccccda.....',
      '...abcccda......',
      '..abdccda.......',
      '..acebcda.......',
      '..abbccda.......',
      '..acccdda.......',
      '...abdebca......',
      '...accbccca.....',
      '....acdcccca....',
      '.....aacdddca...',
      '.......aaaaa....',
      '................'
    ]
  },

  galaxy: {
    colors: { a: '#6a52c0', b: '#b89aff', c: '#e8dcff', d: '#ffffff' },
    rows: [
      '................',
      '................',
      '.....aaaaa......',
      '....aa..........',
      '...aa.bbaaaa....',
      '...a.b.bbb.aa...',
      '..aabbbccbb.a...',
      '..a.b.cddcbbaa..',
      '..aabbcddc.b.a..',
      '...a.bbccbbbaa..',
      '...aa.bbb.b.a...',
      '....aaaabb.aa...',
      '..........aa....',
      '......aaaaa.....',
      '................',
      '................'
    ]
  },

  comet: {
    colors: { a: '#1a6a9a', b: '#5ad0f0', c: '#3ab0d8', d: '#8ff0ff', e: '#ffffff' },
    rows: [
      '................',
      '................',
      '.............a..',
      '...........aa...',
      '..........aba...',
      '.........aba....',
      '........abba....',
      '.......abba.....',
      '......bbba......',
      '....cddba.......',
      '...cdeda........',
      '...deedc........',
      '...cddc.........',
      '....cc..........',
      '................',
      '................'
    ]
  },

  asteroid: {
    colors: { a: '#141414', b: '#8a7a68', c: '#d8c8b0', d: '#4e4438', e: '#5a4e40' },
    rows: [
      '................',
      '............a...',
      '......aaaa.aba..',
      '....aacccba.a...',
      '...accbbbbbaa...',
      '..acbdbbbbbcba..',
      '.acbdecbbbddda..',
      '.acbbcbbbdeecba.',
      '.abbbbbbbdeecda.',
      '..acbdbbbbccbda.',
      '..abdecbbbbbda..',
      '...abcbbbbdda...',
      '..a.abddddaa....',
      '.aba.aaaaa......',
      '..a.............',
      '................'
    ]
  },

  blackhole: {
    colors: { a: '#e0702a', b: '#ffb84a', c: '#0a0410', d: '#fff4d0' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '......aaaa..bb..',
      '.....accccabbbb.',
      '....acccccca.dd.',
      '...baccccccadd..',
      '..bbaccccccdd...',
      '.bb.accccdda....',
      '.dddddddcca.....',
      '..dd..aaaa......',
      '................',
      '................',
      '................',
      '................'
    ]
  },

  satellite: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#8a8e96', f: '#7aa8ff', g: '#3a6ad8', h: '#fff0a0', i: '#e8b030', j: '#1a3a8a', k: '#9a6a10', l: '#12285e' },
    rows: [
      '................',
      '................',
      '.......aa.......',
      '......abca......',
      '.....acddca.....',
      '.aaaa.aeea.aaaa.',
      '.fffgahhhiafffg.',
      '.gjjjahiikagjjj.',
      '.llllehiikellll.',
      '.fffgahiikafffg.',
      '.gjjjaikkkagjjj.',
      '.aaaa.aeea.aaaa.',
      '.......aa.......',
      '................',
      '................',
      '................'
    ]
  },

  rocket: {
    colors: { a: '#141414', b: '#ff9a8a', c: '#e04a3a', d: '#9a2418', e: '#ffffff', f: '#e6e6e6', g: '#a8a8a8', h: '#c8fbff', i: '#4fd8f0', j: '#1a8aa8', k: '#6e737c', l: '#ff7a1a', m: '#ffd23a' },
    rows: [
      '................',
      '......abca......',
      '.....acddca.....',
      '.....aeeefa.....',
      '....aefggffa....',
      '....aeghiega....',
      '....aegijega....',
      '....aefeefga....',
      '....aeffffga....',
      '...aceffffgca...',
      '..abdfgggggbca..',
      '..acdakkkkacda..',
      '...aaalmmlaaa...',
      '......alla......',
      '.......aa.......',
      '................'
    ]
  },

  ship: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#ff8a2a', e: '#6e737c', f: '#4fd8f0', g: '#e04a3a' },
    rows: [
      '................',
      '................',
      '................',
      '....aa..........',
      '...abca.........',
      '..aabccaaaaa....',
      '.adbcccbbcceaa..',
      '.ddbeeeeefffcea.',
      '.ddcggggbbbbece.',
      '.adcbbbceeeeeaa.',
      '..aabceaaaaaa...',
      '...acea.........',
      '....aa..........',
      '................',
      '................',
      '................'
    ]
  },

  station: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#7a7e86', f: '#fff0a0', g: '#e8b030', h: '#7ff0ff', i: '#9a6a10' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbddddbca...',
      '..abcdaeeaccca..',
      '.abcdaaeeaaccca.',
      '.acdaafffgaabda.',
      '.ahceefggieecha.',
      '.abdeefggieebca.',
      '.abdaagiiiaabda.',
      '.acccaaeeaabcda.',
      '..acccaeeabcda..',
      '...acdbbbbdda...',
      '....aacdddaa....',
      '......aaaa......',
      '................'
    ]
  },

  gate: {
    colors: { a: '#141414', b: '#7a5ab8', c: '#ffcf3a', d: '#c0a8e8', e: '#3e2a70', f: '#1a4a9a', g: '#4fd8f0', h: '#bff6ff', i: '#2a7ad0', j: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '....aabccbaa....',
      '...addebbedba...',
      '..adbeffffbbba..',
      '.adbefggggfbbba.',
      '.adefgghggifdea.',
      '.cdefghjjggfdec.',
      '.cdefggjjhgfdec.',
      '.adefigghggfdea.',
      '.abbbfggggfdbea.',
      '..abbbffffdbea..',
      '...abedbbdeea...',
      '....aabccbaa....',
      '......aaaa......',
      '................'
    ]
  },

  telescope: {
    colors: { a: '#141414', b: '#fff0a0', c: '#e8b030', d: '#9fd0ff', e: '#3a8ef0', f: '#9a6a10', g: '#1d4fa8', h: '#3a3f48', i: '#9a9ea8' },
    rows: [
      '................',
      '................',
      '...........aaa..',
      '.........aabbca.',
      '.......aadebcfa.',
      '.....aaddegcffa.',
      '...aaddeeegeaa..',
      '..ahdeeeggaa....',
      '..ahegggaa......',
      '...aaaaia.......',
      '.....aiiia......',
      '....aiaiaia.....',
      '...aiaaiaaia....',
      '..aia.aia.aia...',
      '...a...a...a....',
      '................'
    ]
  },

  alien: {
    colors: { a: '#141414', b: '#b6f59a', c: '#4cc04a', d: '#1f7a2a', e: '#101820', f: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbccccbca...',
      '..abccccccccca..',
      '.abdddccccdddca.',
      '.aceeebccdeeeca.',
      '.aceefbccdeefca.',
      '.acceebccdeebda.',
      '..acbbccccbbda..',
      '...acccddccda...',
      '....acdddbda....',
      '.....acbbda.....',
      '......acda......',
      '.......aa.......',
      '................'
    ]
  },

  question: {
    colors: { a: '#141414', b: '#fff1a8', c: '#ffcf3a', d: '#d48a12', e: '#5a3600' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbddddbca...',
      '..abcdeeeeccca..',
      '.abcdeebceebcca.',
      '.abccbbcdeebcda.',
      '.abccccdeebccda.',
      '.abcccdeebcccda.',
      '.abcccdeebcccda.',
      '.acccccccccccda.',
      '..acccdeebccda..',
      '...acddeebdda...',
      '....aacccdaa....',
      '......aaaa......',
      '................'
    ]
  },

  info: {
    colors: { a: '#141414', b: '#9fd0ff', c: '#3a8ef0', d: '#1d4fa8', e: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbcddcbca...',
      '..abccdeebccca..',
      '.abcccdeebcccca.',
      '.abcccdccccccda.',
      '.abccdeeebcccda.',
      '.abcccceebcccda.',
      '.abcccdeebcccda.',
      '.accccdeebcccda.',
      '..acccdeecccda..',
      '...acdeeeecda...',
      '....aaccccaa....',
      '......aaaa......',
      '................'
    ]
  },

  warning: {
    colors: { a: '#141414', b: '#fff1a8', c: '#ffcf3a', d: '#d48a12', e: '#3a2400' },
    rows: [
      '................',
      '.......aa.......',
      '......abca......',
      '......abda......',
      '.....abddca.....',
      '.....aceeca.....',
      '....abdeebca....',
      '....abdeebda....',
      '...abcdeebcca...',
      '...abcdeebcda...',
      '..abccccccccca..',
      '..abccdeebccda..',
      '.abcccdeebcccca.',
      '.acddddccddddda.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  check: {
    colors: { a: '#141414', b: '#b6f59a', c: '#4cc04a', d: '#1f7a2a', e: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbccccbca...',
      '..abcccccccdca..',
      '.abcccccccdeeca.',
      '.abccccccdeebda.',
      '.abcddccdeebcda.',
      '.abdeecdeebccda.',
      '.abcceeeebcccda.',
      '.acccceebccccda.',
      '..acccbbccccda..',
      '...acdccccdda...',
      '....aacdddaa....',
      '......aaaa......',
      '................'
    ]
  },

  cross: {
    colors: { a: '#141414', b: '#ff9a8a', c: '#e04a3a', d: '#9a2418', e: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbccccbca...',
      '..abddccccddca..',
      '.abdeecccdeebca.',
      '.abcceecdeebcda.',
      '.abccceeeebccda.',
      '.abccdeeeecccda.',
      '.abcdeebceeccda.',
      '.acdeebccceebda.',
      '..acbbccccbbda..',
      '...acdccccdda...',
      '....aacdddaa....',
      '......aaaa......',
      '................'
    ]
  },

  idea: {
    colors: { a: '#141414', b: '#fff1a8', c: '#ffcf3a', d: '#d48a12', e: '#ffffff', f: '#b8bcc4', g: '#6e737c' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abcccccbca...',
      '..abdebcccccca..',
      '..acebccccccda..',
      '..abbcccccccda..',
      '..acccccccccda..',
      '...acccccccda...',
      '....acccccda....',
      '.....acddda.....',
      '.....affffa.....',
      '.....agggga.....',
      '.....affffa.....',
      '......agga......',
      '................'
    ]
  },

  search: {
    colors: { a: '#141414', b: '#b8bcc4', c: '#4fd8f0', d: '#c8fbff', e: '#ffffff', f: '#1a8aa8', g: '#6e737c', h: '#e0a868', i: '#a8733a', j: '#6a4420' },
    rows: [
      '................',
      '....aaaa........',
      '...abbbba.......',
      '..abcddcba......',
      '.abcedcccba.....',
      '.abddcccccba....',
      '.abdccccfba.....',
      '.abcccccfba.....',
      '..abcfffbga.....',
      '...abbbbhia.....',
      '....aaaaiiia....',
      '........aiiia...',
      '.........aiiia..',
      '..........aiiia.',
      '...........aija.',
      '................'
    ]
  },

  clock: {
    colors: { a: '#141414', b: '#4a4f58', c: '#ffffff', d: '#e6e6e6', e: '#a8a8a8', f: '#1a1a1a', g: '#e04a3a' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbbaa....',
      '...abbcdcdbba...',
      '..abccefcdcdba..',
      '.abcddefcddddba.',
      '.abcddefcdddeba.',
      '.abcddefdeedeba.',
      '.abcddegfffceba.',
      '.abcdddccccdeba.',
      '.abdddddddddeba.',
      '..abdeddddeeba..',
      '...abbdeeebba...',
      '....aabbbbaa....',
      '......aaaa......',
      '................'
    ]
  },

  calendar: {
    colors: { a: '#141414', b: '#4a4f58', c: '#ff9a8a', d: '#e04a3a', e: '#9a2418', f: '#ffffff', g: '#e6e6e6', h: '#8a8a8a', i: '#a8a8a8' },
    rows: [
      '................',
      '.....a....a.....',
      '..aaabaaaabaaa..',
      '.accdbcccdbccda.',
      '.acddcddddcddea.',
      '.adeeeeeeeeeeea.',
      '.afgfgfgfgfgfga.',
      '.aghghghghghfia.',
      '.afggggggggggia.',
      '.aghghghghghfia.',
      '.afggggggggggia.',
      '.aghghgdghghfia.',
      '.affgfgfgfgfgia.',
      '.agiiiiiiiiiiia.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  home: {
    colors: { a: '#141414', b: '#ff9a8a', c: '#e04a3a', d: '#9a2418', e: '#fff4d0', f: '#e8d098', g: '#c8fbff', h: '#4fd8f0', i: '#b89a5a', j: '#e0a868', k: '#a8733a', l: '#1a8aa8', m: '#6a4420' },
    rows: [
      '................',
      '.......aa.......',
      '......abca......',
      '.....abccca.....',
      '....abccccca....',
      '...abccccccca...',
      '..abccccccccca..',
      '.acddddddddddca.',
      '..aeffeeffeefa..',
      '..afgheijkefia..',
      '..afhleijmefia..',
      '..aeeefijmefia..',
      '..aefffijmefia..',
      '..afiiiikmfiia..',
      '...aaaaaaaaaa...',
      '................'
    ]
  },

  lock: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#fff0a0', f: '#e8b030', g: '#9a6a10', h: '#3a2400' },
    rows: [
      '................',
      '......aaaa......',
      '.....abccca.....',
      '....abdaacca....',
      '...abda..acca...',
      '...aca....aca...',
      '..aacaaaaaacaa..',
      '.aeeeeeeeeeeefa.',
      '.aeffffggffffga.',
      '.aefffghhffffga.',
      '.aeffghhhheffga.',
      '.aeffffhhefffga.',
      '.aefffghhefffga.',
      '.afggggffggggga.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  key: {
    colors: { a: '#141414', b: '#fff0a0', c: '#e8b030', d: '#9a6a10' },
    rows: [
      '................',
      '................',
      '................',
      '...aaaa.........',
      '..abccca........',
      '.abdaaccaaaaaa..',
      '.aca..abbbbbbca.',
      '.aca..abddcdcda.',
      '.accaabdaacaca..',
      '..acccda.acaca..',
      '...aaaa..accda..',
      '..........aaa...',
      '................',
      '................',
      '................',
      '................'
    ]
  },

  pin: {
    colors: { a: '#141414', b: '#ff9a8a', c: '#e04a3a', d: '#9a2418', e: '#ffffff' },
    rows: [
      '................',
      '......aaaa......',
      '.....abbbca.....',
      '....abccccca....',
      '...abccddccca...',
      '...abcdeeccda...',
      '...abdeeeebda...',
      '...abcceebcda...',
      '...acccbbccda...',
      '....acccccda....',
      '.....abccda.....',
      '.....acccda.....',
      '......abda......',
      '......acda......',
      '.......aa.......',
      '................'
    ]
  },

  eye: {
    colors: { a: '#141414', b: '#ffffff', c: '#e6e6e6', d: '#a8a8a8', e: '#9fd0ff', f: '#3a8ef0', g: '#1d4fa8', h: '#1a1a1a' },
    rows: [
      '................',
      '................',
      '................',
      '.....aaaaaa.....',
      '...aabbbbbcaa...',
      '..abbcddddcbca..',
      '.abccdefffcccca.',
      '.bccdeghbefbccc.',
      '.cccdfghhegbccd.',
      '.accccfffgbccda.',
      '..acdcbbbbcdda..',
      '...aacdddddaa...',
      '.....aaaaaa.....',
      '................',
      '................',
      '................'
    ]
  },

  heart: {
    colors: { a: '#141414', b: '#e04a3a', c: '#ff9a8a', d: '#ffd0c8', e: '#9a2418' },
    rows: [
      '................',
      '................',
      '...aaa....aaa...',
      '..abcba..accba..',
      '.abdcbbaacbbbba.',
      '.abdcbbccbbbbea.',
      '.accbbbbbbbbbea.',
      '.abbbbbbbbbbbea.',
      '..abbbbbbbbbea..',
      '...abbbbbbbea...',
      '....abbbbbea....',
      '.....abbbea.....',
      '......abea......',
      '.......aa.......',
      '................',
      '................'
    ]
  },

  chart: {
    colors: { a: '#141414', b: '#9a9ea8', c: '#b6f59a', d: '#4cc04a', e: '#1f7a2a', f: '#fff1a8', g: '#ffcf3a', h: '#d48a12', i: '#9fd0ff', j: '#3a8ef0', k: '#1d4fa8' },
    rows: [
      '................',
      '..a.............',
      '.aba.......aaa..',
      '.aba......accda.',
      '.aba......acdea.',
      '.aba...aaaacdea.',
      '.aba..affgacdea.',
      '.aba..afghacdea.',
      '.abaaaafghacdea.',
      '.abaiijfghacdea.',
      '.abaijkfghacdea.',
      '.abaijkfghacdea.',
      '.abajkkghhadeea.',
      '.abbbbbbbbbbbba.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  link: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#d8e8ff', f: '#8aa8d8', g: '#4a6898' },
    rows: [
      '................',
      '................',
      '................',
      '...aaaaa........',
      '..abcccca.......',
      '.abdaaaccaa.....',
      '.aca.aeffffa....',
      '.acaaegacaffa...',
      '.acaafaacaafa...',
      '.accafabdaafa...',
      '..accfcda.afa...',
      '...aaffaaaega...',
      '.....affffga....',
      '......aaaaa.....',
      '................',
      '................'
    ]
  },

  gear: {
    colors: { b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#3e4249' },
    rows: [
      '................',
      '.......bc.......',
      '.......be.......',
      '...bc.bccc.bc...',
      '...ccbccccbce...',
      '....bccbbcce....',
      '...bccb..cccc...',
      '.bbccb....dccbc.',
      '.ceccb....dccee.',
      '...cccc..dcce...',
      '....bccddcce....',
      '...bceccccecc...',
      '...ce.ccce.ce...',
      '.......be.......',
      '.......ce.......',
      '................'
    ]
  },

  wrench: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c' },
    rows: [
      '................',
      '..........aa....',
      '.........abcaa..',
      '........abdaaca.',
      '.......abcdabda.',
      '.......abccbcda.',
      '.......abcccda..',
      '......abcddda...',
      '.....abcdaaa....',
      '....abcda.......',
      '...abcda........',
      '..abcda.........',
      '.abcda..........',
      '.acda...........',
      '..aa............',
      '................'
    ]
  },

  bolt: {
    colors: { a: '#141414', b: '#fff1a8', c: '#ffcf3a', d: '#d48a12' },
    rows: [
      '................',
      '........aaaa....',
      '.......abbbca...',
      '......abccda....',
      '.....abccda.....',
      '....abccdaaa....',
      '...abccccbbca...',
      '...acddcccdda...',
      '....aaabcdaa....',
      '.....abcda......',
      '....abdda.......',
      '...abdaa........',
      '..acda..........',
      '.acaa...........',
      '..a.............',
      '................'
    ]
  },

  flask: {
    colors: { a: '#141414', b: '#b8bcc4', c: '#cfe8f0', d: '#1e3238', e: '#b6f59a', f: '#4cc04a', g: '#1f7a2a', h: '#e8ffe0' },
    rows: [
      '................',
      '.....aaaaaa.....',
      '....abbbbbba....',
      '.....acddca.....',
      '.....acddca.....',
      '.....acddca.....',
      '....acddddca....',
      '...acddddddca...',
      '...acefeeefca...',
      '..aceghefgffca..',
      '..acefefghegca..',
      '.acefgfffefffca.',
      '.acfghfggggggca.',
      '.acccccccccccca.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  radio: {
    colors: { a: '#141414', b: '#4fd8f0', c: '#ff4a3a', d: '#f4f6fa', e: '#b8bcc4', f: '#6e737c' },
    rows: [
      '................',
      '..a..........a..',
      '.abaa......aaba.',
      '.baaba.aa.abaab.',
      '.baba.acca.abab.',
      '.baba.adea.abab.',
      '.baabaadfaabaab.',
      '.abaa.adfa.aaba.',
      '..a..adffea..a..',
      '.....aeaaea.....',
      '....adfeefea....',
      '....aeaaaaea....',
      '...adfeeeefea...',
      '...aeaaaaaaea...',
      '....a......a....',
      '................'
    ]
  },

  chip: {
    colors: { a: '#141414', b: '#c0c4cc', c: '#6a707a', d: '#3a3f48', e: '#22252a', f: '#fff0a0', g: '#e8b030', h: '#9a6a10' },
    rows: [
      '................',
      '....a.a..a.a....',
      '...ababaababa...',
      '...ababaababa...',
      '.aacccccccccdaa.',
      '.bbcdeeeeeedebb.',
      '.aacefffffgceaa.',
      '.bbcefgggghcebb.',
      '.aacefgggghceaa.',
      '.bbceghhhhhcebb.',
      '.aacdccccccdeaa.',
      '.bbdeeeeeeeeebb.',
      '.aaababaababaaa.',
      '...ababaababa...',
      '....a.a..a.a....',
      '................'
    ]
  },

  robot: {
    colors: { a: '#141414', b: '#ff4a3a', c: '#7a7e86', d: '#f4f6fa', e: '#b8bcc4', f: '#6e737c', g: '#7ff0ff', h: '#2a2f36' },
    rows: [
      '................',
      '......abba......',
      '...aaaaccaaaa...',
      '..adddddddddea..',
      '..adeffeeffefa..',
      '..adfggdfggdfa..',
      '.aadfggdfggdfaa.',
      '.ccdeeeffeeefcc.',
      '.aadfhhhhhhdfaa.',
      '..adeddddddefa..',
      '..aefffffffffa..',
      '...aaccccccaa...',
      '...adddddddea...',
      '..aeffffffffea..',
      '...aaaaaaaaaa...',
      '................'
    ]
  },

  atom: {
    colors: { a: '#4fd8f0', b: '#ffb0a0', c: '#ff5a4a', d: '#b82a1a' },
    rows: [
      '................',
      '................',
      '....aaa..aaa....',
      '....a.aaaa.a....',
      '....a..aa..a....',
      '....aaaaaaaa....',
      '..aaa.a..a.aaa..',
      '.aa..a.bc.a..aa.',
      '.aa..a.cd.a..aa.',
      '..aaa.a..a.aaa..',
      '....aaaaaaaa....',
      '....a..aa..a....',
      '....a.aaaa.a....',
      '....aaa..aaa....',
      '................',
      '................'
    ]
  },

  terminal: {
    colors: { a: '#141414', b: '#f0ead8', c: '#d8d0b8', d: '#102010', e: '#4cff6a', f: '#9a927a' },
    rows: [
      '................',
      '................',
      '..aaaaaaaaaaaa..',
      '.abccccccccccca.',
      '.acddddddddddca.',
      '.acdeddddddddca.',
      '.acddedddddddca.',
      '.acdedeeeddddca.',
      '.acddddddddddca.',
      '.acddddddddddca.',
      '.acccccbbccccfa.',
      '..aaaaabfaaaaa..',
      '....accffcca....',
      '.....aaaaaa.....',
      '................',
      '................'
    ]
  },

  dna: {
    colors: { a: '#4a9aff', b: '#ff5a6a', c: '#9ea4ae' },
    rows: [
      '................',
      '......a..b......',
      '......b..a......',
      '.....b....a.....',
      '....bcccccca....',
      '...b........a...',
      '....bcccccca....',
      '......b..a......',
      '.......ab.......',
      '......a..b......',
      '....accccccb....',
      '...a........b...',
      '....accccccb....',
      '.....a....b.....',
      '......a..b......',
      '................'
    ]
  },

  blaster: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#6e737c', e: '#4fd8f0', f: '#ffea7a', g: '#3a3f48', h: '#8a7a6a', i: '#5a4a3a', j: '#3a2e24' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '...aaaaaaaaaaa..',
      '..abbbbcccbbbca.',
      '..abccdeeebccdf.',
      '..abccccccdddda.',
      '..acdddggaaaaa..',
      '...ahhiaga......',
      '...ahijaa.......',
      '..ahija.........',
      '..aijja.........',
      '...aaa..........',
      '................',
      '................'
    ]
  },

  document: {
    colors: { a: '#141414', b: '#ffffff', c: '#e6e6e6', d: '#c8c8c8', e: '#a8a8a8', f: '#8a8a8a' },
    rows: [
      '................',
      '...aaaaaaaa.....',
      '..abbbbbbcda....',
      '..abcccccedda...',
      '..abccccceddda..',
      '..abceeeeecbca..',
      '..abeffffffbea..',
      '..abccccccccea..',
      '..abeffffffbea..',
      '..abcccccbbcea..',
      '..abeffffbccea..',
      '..abccccceecea..',
      '..abeffffffbea..',
      '..acecccccceea..',
      '...aaaaaaaaaa...',
      '................'
    ]
  },

  book: {
    colors: { a: '#141414', b: '#ffffff', c: '#e6e6e6', d: '#a8a8a8', e: '#bdbdbd', f: '#7a7a7a', g: '#a85a2a', h: '#d08a4a', i: '#6a3418' },
    rows: [
      '................',
      '................',
      '...aaaa..aaaa...',
      '..abbbcaabbbca..',
      '.abddddeecdddca.',
      '.acffffeeffffca.',
      '.abcccceeccccda.',
      '.acffffeeffffca.',
      '.abcccceeccccda.',
      '.acffffeeffffca.',
      '.accccceeccccda.',
      '.gghhhhhhhhhhgg.',
      '.aagiiiiiiiiiaa.',
      '...aaaaaaaaaa...',
      '................',
      '................'
    ]
  },

  scroll: {
    colors: { a: '#141414', b: '#f0d8a0', c: '#c8a060', d: '#6a4420', e: '#8a6a30', f: '#fff4d0', g: '#e8d098', h: '#9a7a4a', i: '#b89a5a' },
    rows: [
      '................',
      '..aaaaaaaaaaaa..',
      '.abbbbbbbbbbbca.',
      '.dbcccccccccced.',
      '.aceeeeeeeeeeea.',
      '..afggggggggga..',
      '..aghhhhhhhhga..',
      '..afggggggffia..',
      '..aghhhhhhfgia..',
      '..afffffffggia..',
      '..agiiiiiiiiia..',
      '.abbbbbbbbbbbca.',
      '.dbcccccccccced.',
      '.aceeeeeeeeeeea.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  folder: {
    colors: { a: '#141414', b: '#e8b040', c: '#c88a20', d: '#8a5a10', e: '#ffffff', f: '#fff0a0', g: '#ffd25a', h: '#c8901a' },
    rows: [
      '................',
      '................',
      '..aaaa..........',
      '.abbbca.........',
      '.abccccaaaaaaa..',
      '.abcdddcccccbca.',
      '.acdeeeeeeeecda.',
      '.afffffffffffga.',
      '.afggggggggggha.',
      '.afggggggggggha.',
      '.afggggggggggha.',
      '.afggggggggggha.',
      '.aghhhhhhhhhhha.',
      '..aaaaaaaaaaaa..',
      '................',
      '................'
    ]
  },

  letter: {
    colors: { a: '#141414', b: '#b0a890', c: '#e8e4d8', d: '#ffffff', e: '#a8a090', f: '#e04a3a' },
    rows: [
      '................',
      '................',
      '................',
      '..aaaaaaaaaaaa..',
      '.abcddddddddcba.',
      '.acbcccccccebca.',
      '.adcbcccccebdea.',
      '.adccbceeebdcea.',
      '.adcccbffbdccea.',
      '.adccccffdcccea.',
      '.adccccddccccea.',
      '.adccccccccccea.',
      '.aceeeeeeeeeeea.',
      '..aaaaaaaaaaaa..',
      '................',
      '................'
    ]
  },

  quill: {
    colors: { a: '#141414', b: '#ffffff', c: '#dcdcf0', d: '#8a8aa8', e: '#9a9ab8', f: '#3a3a3a', g: '#2a4ad8' },
    rows: [
      '................',
      '...........aaa..',
      '.........aabcda.',
      '........abbedca.',
      '.......abcedbea.',
      '......abcedbea..',
      '.....abcedcea...',
      '.....abedcaa....',
      '.....acdaa......',
      '.....ada........',
      '....afa.........',
      '...afa..........',
      '..afa...........',
      '.agga...........',
      '..aa............',
      '................'
    ]
  },

  map: {
    colors: { a: '#141414', b: '#fff4d0', c: '#e8d098', d: '#7ab85a', e: '#e0c890', f: '#c0a468', g: '#c81e1e', h: '#8a7040', i: '#e04a3a', j: '#b89a5a', k: '#6aa8d8' },
    rows: [
      '................',
      '................',
      '..aaaa....aaaa..',
      '.abcccaaaabcbca.',
      '.acddceeefcgcga.',
      '.acdddeffhbcgca.',
      '.abcddefhicgcga.',
      '.abcbcfhifcccca.',
      '.abcjjieehkkcja.',
      '.abjiceffhkkkca.',
      '.acibjehhhckkca.',
      '.abbcjfkkfbbbja.',
      '.acjjjfkkfcjjja.',
      '..aaaafffhaaaa..',
      '......aaaa......',
      '................'
    ]
  },

  people: {
    colors: { a: '#141414', b: '#ffe4c8', c: '#f0c090', d: '#c08a5a', e: '#9fd0ff', f: '#3a8ef0', g: '#1d4fa8', h: '#ff9a8a', i: '#e04a3a', j: '#9a2418' },
    rows: [
      '................',
      '....aa..........',
      '...abca.........',
      '..abccca........',
      '..acccda.aa.....',
      '...acda.abca....',
      '..aaaaaabccca...',
      '.aeeeeefcccda...',
      '.efffffffcda....',
      '.efffffggaaaa...',
      '.effffghhhhhia..',
      '.fgggghiiiiiiia.',
      '.aaaaahiiiiiija.',
      '.....aijjjjjjja.',
      '......aaaaaaaa..',
      '................'
    ]
  },

  person: {
    colors: { a: '#141414', b: '#ffe4c8', c: '#f0c090', d: '#c08a5a', e: '#9ab8f0', f: '#5a7ab8', g: '#2e4478' },
    rows: [
      '................',
      '......aaaa......',
      '.....abbbca.....',
      '....abccccca....',
      '....abccccda....',
      '....acccccda....',
      '.....acccda.....',
      '....aaacdaaa....',
      '...aeeeeeeefa...',
      '..aefffffffffa..',
      '.aefffffffffffa.',
      '.aeffffffffffga.',
      '.aeffffffffffga.',
      '.afggggggggggga.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  flag: {
    colors: { a: '#141414', b: '#ffcf3a', c: '#b8bcc4', d: '#ff9a8a', e: '#e04a3a', f: '#9a2418', g: '#6e737c' },
    rows: [
      '................',
      '.abaaaa....aaa..',
      '.acdddeaa.addea.',
      '.acdeeedeadeefa.',
      '.acdeeeeedeeefa.',
      '.acdeeeeeeeeefa.',
      '.acdeeeeeeeeefa.',
      '.aceffeeeeefffa.',
      '.acaaaeffffaaa..',
      '.aca..aaaaa.....',
      '.aca............',
      '.aca............',
      '.aca............',
      '.cgca...........',
      '.aaa............',
      '................'
    ]
  },

  shield: {
    colors: { a: '#141414', b: '#f4f6fa', c: '#b8bcc4', d: '#9fd0ff', e: '#3a8ef0', f: '#f0f0f0', g: '#1d4fa8' },
    rows: [
      '................',
      '..aaaaaaaaaaaa..',
      '.abccccccccccca.',
      '.acdddeffdddeca.',
      '.acegggffegggca.',
      '.acffffffffffca.',
      '.acffffffffffca.',
      '.acdddeffdddeca.',
      '.aceeegffdeegca.',
      '..acdegffdegca..',
      '..aceegffdegca..',
      '...acegffdgca...',
      '....aceffeca....',
      '.....acccca.....',
      '......aaaa......',
      '................'
    ]
  },

  crown: {
    colors: { a: '#141414', b: '#e8b030', c: '#fff0a0', d: '#9a6a10', e: '#ff3a5a', f: '#3ab0ff', g: '#c8901a' },
    rows: [
      '................',
      '................',
      '................',
      '..a....aa....a..',
      '.aba..acba..aba.',
      '.acba.acda.acda.',
      '.acbbacbbbacbda.',
      '.acbbcbbbbcbbda.',
      '.acbdbbddbbdbda.',
      '.acdecdffcdecda.',
      '.abdbddbbddbdda.',
      '.agggggggggggga.',
      '..aaaaaaaaaaaa..',
      '................',
      '................',
      '................'
    ]
  },

  skull: {
    colors: { a: '#141414', b: '#ffffff', c: '#e8e4d8', d: '#a8a090', e: '#1a1a1a' },
    rows: [
      '................',
      '.....aaaaaa.....',
      '...aabbbbbcaa...',
      '..abbccccccbca..',
      '.abccccccccccca.',
      '.abcdddccdddcda.',
      '.abdeeebdeeebda.',
      '.abdeeebdeeebda.',
      '.accbbbddbbbcda.',
      '..acccdeebccda..',
      '...abdccbdcda...',
      '...acececebda...',
      '...accdcdcdda...',
      '....aaaaaaaa....',
      '................',
      '................'
    ]
  },

  swords: {
    colors: { a: '#141414', b: '#ffffff', c: '#aab0bc', d: '#ffcf3a', e: '#8a5424' },
    rows: [
      '................',
      '..aa........aa..',
      '.abca......acba.',
      '..abca....acba..',
      '...abca..acba...',
      '....abcaacba....',
      '.....abccba.....',
      '......acba......',
      '.....acbbca.....',
      '...aacbaabcaa...',
      '..adaca..acada..',
      '...ada....ada...',
      '..aeada..adaea..',
      '.aea.a....a.aea.',
      '..a..........a..',
      '................'
    ]
  },

  target: {
    colors: { a: '#141414', b: '#ff9a8a', c: '#e04a3a', d: '#9a2418' },
    rows: [
      '................',
      '......abca......',
      '....aaccccaa....',
      '...abcacdacca...',
      '..abdaaaaaacca..',
      '..acaaccccaaca..',
      '.acaacaaaacaaca.',
      '.bccacabcacabcc.',
      '.ccdacacdacaccd.',
      '.acaacaaaacaaca.',
      '..acaaccccaaca..',
      '..accaaaaaabda..',
      '...accabcacda...',
      '....aaccccaa....',
      '......acda......',
      '................'
    ]
  },

  medal: {
    colors: { a: '#141414', b: '#e04a3a', c: '#ff9a8a', d: '#9fd0ff', e: '#3a8ef0', f: '#9a2418', g: '#1d4fa8', h: '#fff0a0', i: '#e8b030', j: '#9a6a10', k: '#fff8d0' },
    rows: [
      '................',
      '...aaaa.aaaa....',
      '..abccbadddea...',
      '...abbfadega....',
      '....abbbdga.....',
      '.....abega......',
      '.....ahhhia.....',
      '....ahijjiia....',
      '...ahijkkiiia...',
      '...ahjkkkkhja...',
      '...ahiikkiija...',
      '...aijkhikhja...',
      '....aihiihja....',
      '.....aijjja.....',
      '......aaaa......',
      '................'
    ]
  },

  medkit: {
    colors: { a: '#141414', b: '#a0a4ac', c: '#6e737c', d: '#ffffff', e: '#e6e6e6', f: '#a8a8a8', g: '#ff9a8a', h: '#e04a3a', i: '#9a2418' },
    rows: [
      '................',
      '................',
      '......aaaa......',
      '.....abccca.....',
      '..aaaacaacaaaa..',
      '.adddddeeddddea.',
      '.adeeefghdeeefa.',
      '.adeeffgiefeefa.',
      '.adefgghhghdefa.',
      '.adefhihhiidefa.',
      '.adeedegiddeefa.',
      '.adeeefhideeefa.',
      '.aeffffeefffffa.',
      '..aaaaaaaaaaaa..',
      '................',
      '................'
    ]
  },

  coin: {
    colors: { a: '#141414', b: '#fff0a0', c: '#e8b030', d: '#9a6a10' },
    rows: [
      '................',
      '......aaaa......',
      '....aabbbcaa....',
      '...abbccccbca...',
      '..abccddddccca..',
      '.abccdddddbccca.',
      '.abcdddbbbcccda.',
      '.abcddbccccccda.',
      '.abcddcccccccda.',
      '.abcdddcddcccda.',
      '.accccddddbccda.',
      '..acccbbbbccda..',
      '...acdccccdda...',
      '....aacdddaa....',
      '......aaaa......',
      '................'
    ]
  },

  crate: {
    colors: { a: '#141414', b: '#c08040', c: '#8a5424', d: '#d8a868', e: '#f6d29a', f: '#a87a40', g: '#5a3414' },
    rows: [
      '................',
      '..aaaaaaaaaaaa..',
      '.abccccccccccca.',
      '.accdeeeeeedcca.',
      '.acdcdddddfcdca.',
      '.acedcdddfcefca.',
      '.aceddcdfcedfca.',
      '.acedddcceddfca.',
      '.aceddfccdddfca.',
      '.acedfcedcddfca.',
      '.acefcedddcdfca.',
      '.acdcedddddcdca.',
      '.accdffffffdcca.',
      '.acccccccccccga.',
      '..aaaaaaaaaaaa..',
      '................'
    ]
  },

  gem: {
    colors: { a: '#141414', b: '#c8f4ff', c: '#8ae6ff', d: '#3ac0e8', e: '#a8f0ff', f: '#1a7aa8' },
    rows: [
      '................',
      '................',
      '.....aaaaaa.....',
      '....abbbbbba....',
      '...abccbbccba...',
      '..abcccbbcccba..',
      '.adddddddddddda.',
      '..adeddddddfda..',
      '...adeddddfda...',
      '....adeddfda....',
      '.....adefda.....',
      '......adda......',
      '.......aa.......',
      '................',
      '................',
      '................'
    ]
  }
}

export const ICON_NAMES = Object.keys(ICONS)

export const ICON_DEFS = ICONS
const DEFAULT_ICON = 'book'

// Own keys only: an icon "toString" is not one of Object's.
const isIcon = name => typeof name === 'string' && Object.hasOwn(ICONS, name)

export function iconSprite(name) {
  const { colors, rows } = ICONS[isIcon(name) ? name : DEFAULT_ICON]
  const sprite = createSprite(ICON_SIZE, ICON_SIZE)
  rows.forEach((row, y) => [...row].forEach((char, x) => {
    if (colors[char]) setPixel(sprite, x, y, colors[char])
  }))
  return sprite
}

const cache = new Map()

export function iconUri(name) {
  const key = isIcon(name) ? name : DEFAULT_ICON
  if (!cache.has(key)) cache.set(key, spriteToDataUri(iconSprite(key)))
  return cache.get(key)
}
