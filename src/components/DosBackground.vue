<template>
  <!-- A component of its own, so its typing (every 100-250 ms) redraws only itself,
     not the sector screen around it. -->
  <div class="ms-dos-background" :class="{ 'is-live': live }" :style="dosStyle" @click="focus">
    <div class="terminal-output">
      <div class="boot-line" v-for="(line, index) in visibleLines" :key="index">
        <span v-if="line.type === 'loading'">
          {{ line.text }} {{ getSpinner(line.spinner) }}
        </span>
        <span v-else-if="line.type === 'prompt'">
          <span class="prompt">{{ line.text }}</span><span class="dos-command">{{ line.command }}</span>
        </span>
        <span v-else>{{ line.text }}</span>
      </div>
    </div>

    <div class="command-line">
      <span class="prompt">{{ currentPath }}</span><span class="typing-command">{{ live ? dosLine : currentTypingCommand }}</span><span v-show="!dosRunning" class="cursor-dos">_</span>
      <input
        ref="dosInputRef"
        v-model="dosLine"
        class="dos-input"
        type="text"
        maxlength="80"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :aria-label="t('system.dosLine')"
        :disabled="!live"
        :tabindex="live ? 0 : -1"
        @keydown="handleDosKey"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { createDosShell } from '../utils/dosShell'
import { t } from '../i18n'
import { playSound } from '../sound'

const props = defineProps({
  running: { type: Boolean, default: false },
  live: { type: Boolean, default: false },
  bottomPadding: { type: Number, default: 0 }
})

const mapStore = useMapStore()
const uiStore = useUIStore()

const DOS_LINES_KEPT = 30
const INITIAL_LINES = 20
const SPINNER_FRAMES = ['|', '/', '-', '\\']
const DOS_OUTPUT_LINE_MS = 45
const DOS_OUTPUT_LOADING_MS = 1200
const DOS_HACK_DELAY_MS = 800

const visibleLines = ref([])
const currentTypingCommand = ref('')
const currentPath = ref('C:\\>')
// A ref, so the template redraws the spinners of the loading lines as it turns.
const spinnerIndex = ref(0)
const dosStyle = computed(() => (props.bottomPadding > 20 ? { paddingBottom: `${props.bottomPadding}px` } : null))

const dosScript = () => mapStore.terminal.script
let currentIndex = 0
let lineInterval = null
let spinnerInterval = null
let dosTypingInterval = null
let isLoadingLine = false
let isTypingCommand = false
let typingCharIndex = 0
let currentCommand = ''
let typingLine = null
let isUnmounted = false

const pendingTimeouts = new Set()
function scheduleTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(timeoutId)
    callback()
  }, delay)
  pendingTimeouts.add(timeoutId)
}

const getSpinner = active => (active ? SPINNER_FRAMES[spinnerIndex.value % SPINNER_FRAMES.length] : '')

function pushDosLine(line) {
  visibleLines.value.push(line)
  if (visibleLines.value.length > DOS_LINES_KEPT) visibleLines.value.shift()
}

function commitTypedCommand() {
  if (!typingLine) return
  clearInterval(dosTypingInterval)
  pushDosLine(typingLine)
  typingLine = null
  currentTypingCommand.value = ''
  isTypingCommand = false
  currentIndex++
}

function initializeLines() {
  const script = dosScript()
  for (let index = 0; index < Math.min(INITIAL_LINES, script.length); index++) visibleLines.value.push(script[index])
  currentIndex = Math.min(INITIAL_LINES, script.length)
  if (script[currentIndex - 1]) currentPath.value = script[currentIndex - 1].path
}

function typeScript() {
  if (props.live || dosRunning.value || isTypingCommand || isLoadingLine) return

  const script = dosScript()
  if (currentIndex >= script.length) {
    currentIndex = 0
    if (visibleLines.value.length > 10) visibleLines.value = visibleLines.value.slice(-10)
    return
  }
  const currentLine = script[currentIndex]
  if (currentLine.path) currentPath.value = currentLine.path

  if (currentLine.command && currentLine.command.length > 0) {
    isTypingCommand = true
    typingLine = currentLine
    currentCommand = currentLine.command
    typingCharIndex = 0
    dosTypingInterval = setInterval(() => {
      if (typingCharIndex < currentCommand.length) {
        currentTypingCommand.value = currentCommand.substring(0, typingCharIndex + 1)
        typingCharIndex++
      } else {
        clearInterval(dosTypingInterval)
        scheduleTimeout(commitTypedCommand, 300)
      }
    }, 100)
  } else if (currentLine.type === 'loading') {
    pushDosLine(currentLine)
    isLoadingLine = true
    scheduleTimeout(() => {
      isLoadingLine = false
      currentIndex++
    }, 2000)
  } else {
    pushDosLine(currentLine)
    currentIndex++
  }
}

const dosInputRef = ref(null)
const dosLine = ref('')
const dosRunning = ref(false)
// Lines entered while it prints run one after another, as DOS types ahead.
let dosQueue = []
const dosHistory = []
let dosHistoryIndex = 0
let dosShell = createDosShell()

function focus() {
  if (props.live) dosInputRef.value?.focus({ preventScroll: true })
}

watch(() => props.running, running => {
  if (!running || lineInterval) return
  dosShell = createDosShell(mapStore.terminal)
  initializeLines()
  spinnerInterval = setInterval(() => { spinnerIndex.value++ }, 150)
  lineInterval = setInterval(typeScript, 250)
}, { immediate: true })

watch(() => props.live, live => {
  if (live) {
    commitTypedCommand()
    dosShell.setPrompt('C:\\>')
    currentPath.value = dosShell.prompt
    for (const text of ['', t('dos.hint'), '']) pushDosLine({ type: 'text', text })
    nextTick(focus)
  } else {
    dosInputRef.value?.blur()
    dosLine.value = ''
    dosQueue = []
  }
})

function printDosOutput(lines, done) {
  dosRunning.value = true
  const next = index => {
    if (isUnmounted) return
    if (index >= lines.length) {
      dosRunning.value = false
      done?.()
      if (dosQueue.length && props.live) runDosCommand(dosQueue.shift())
      return
    }
    const line = lines[index]
    pushDosLine(line)
    scheduleTimeout(() => next(index + 1), line.type === 'loading' ? DOS_OUTPUT_LOADING_MS : DOS_OUTPUT_LINE_MS)
  }
  next(0)
}

function runDosCommand(command) {
  pushDosLine({ type: 'prompt', text: dosShell.prompt, command })
  if (command.trim()) {
    dosHistory.push(command)
    dosHistoryIndex = dosHistory.length
  }
  const { lines, action, beep } = dosShell.run(command)
  if (action === 'cls') visibleLines.value = []
  if (action === 'exit') {
    uiStore.resetWindows()
    return
  }
  printDosOutput(lines, () => {
    currentPath.value = dosShell.prompt
    if (beep) playSound('badCommand')
    if (action === 'syndicate') {
      dosQueue = []
      scheduleTimeout(() => uiStore.startSyndicateHack(), DOS_HACK_DELAY_MS)
    }
  })
}

function handleDosKey(event) {
  if (!props.live) return
  const { key } = event
  if (key === 'Enter') {
    const command = dosLine.value
    dosLine.value = ''
    if (dosRunning.value) dosQueue.push(command)
    else runDosCommand(command)
  } else if (key === 'Escape') {
    if (dosLine.value) dosLine.value = ''
    else uiStore.closeSystemView()
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (!dosHistory.length) return
    dosHistoryIndex = Math.max(0, Math.min(dosHistory.length, dosHistoryIndex + (key === 'ArrowUp' ? -1 : 1)))
    dosLine.value = dosHistory[dosHistoryIndex] ?? ''
  } else {
    return
  }
  event.preventDefault()
}

onUnmounted(() => {
  isUnmounted = true
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.clear()
  clearInterval(lineInterval)
  clearInterval(spinnerInterval)
  clearInterval(dosTypingInterval)
})

// Exposed so the sector screen can give the keys back to a live terminal
// after a click elsewhere.
defineExpose({ focus })
</script>

<style scoped>
.ms-dos-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: var(--ui-screen);
  padding: 20px;
  font-family: 'Courier New', monospace;
  font-size: 23px;
  line-height: 1.4;
  color: var(--ui-text);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 0;
  pointer-events: none;
}

.terminal-output {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  margin-bottom: 10px;
  padding: 0 max(0px, calc(5vw - 20px)) 0 0;
  max-width: 100%;
}

.boot-line {
  flex: 0 0 auto;
  margin-bottom: 2px;
  animation: fadeIn 0.2s ease-in;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.prompt {
  color: var(--ui-text);
  font-weight: bold;
}

.typing-command {
  color: var(--ui-text);
}

.command-line {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  color: var(--ui-text);
  font-family: 'Courier New', monospace;
  font-size: 24px;
  border-top: 1px solid color-mix(in srgb, var(--ui-line) 60%, var(--ui-screen));
  padding-top: 10px;
  background: var(--ui-screen);
  z-index: 0;
  pointer-events: none;
}

.cursor-dos {
  animation: crt-blink 1s steps(1, end) infinite;
  margin-left: 2px;
}

.ms-dos-background.is-live {
  pointer-events: auto;
}

/* Invisible, over the command line: a tap on a phone opens its keyboard. */
.dos-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  font-size: 16px;
  color: transparent;
  background: transparent;
  caret-color: transparent;
  pointer-events: none;
}
</style>
