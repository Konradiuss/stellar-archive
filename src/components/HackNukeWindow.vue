<template>
  <div class="hack-panel hack-nuke">
    <div class="hack-panel-title">{{ t('syndicate.nukeTitle') }}</div>
    <div class="hack-panel-body">
      <div class="hack-panel-heading">{{ heading }}</div>
      <div class="nuke-target">
        <div>{{ t('syndicate.nukeTarget') }}</div>
        <div>{{ t('syndicate.nukeAuthDisk') }} <span class="hack-panel-blink">{{ t('syndicate.nukeBypassed') }}</span></div>
      </div>

      <div class="nuke-digits">
        <span v-for="(digit, index) in digits" :key="index" class="nuke-digit" :class="{ 'is-locked': index < locked }">{{ digit }}</span>
      </div>
      <div class="nuke-progress-row">
        <div class="hack-panel-progress" :class="{ 'is-done': acquired }"><span :style="{ width: `${progress}%` }"></span></div>
        <span>{{ progress }}%</span>
      </div>

      <div class="nuke-counters">
        <span>{{ t('syndicate.nukeAttempts', { count: attempts.toLocaleString(language()) }) }}</span>
        <span>{{ t('syndicate.nukeRate', { rate }) }}</span>
      </div>

      <div class="nuke-blocks" :class="{ 'is-done': acquired }" aria-hidden="true">
        <span v-for="(on, index) in blocks" :key="index" :class="{ 'is-on': on, 'is-cracked': index < cracked }"></span>
      </div>

      <div class="nuke-dump">
        <div v-for="(row, index) in dump" :key="index">
          <span class="nuke-address">{{ row.address }}</span>
          <span v-for="(byte, column) in row.bytes" :key="column" :class="{ 'is-hit': column === row.hit }">{{ byte }}</span>
        </div>
      </div>

      <div class="nuke-keys">
        <div v-for="(line, index) in keyLines" :key="index" :class="{ 'is-match': line.match }">{{ line.text }}</div>
      </div>
      <div class="nuke-status" :class="{ 'is-done': acquired }">{{ acquired ? t('syndicate.nukeAcquired') : t('syndicate.nukeBruteForce') }}</div>
      <div v-if="acquired" class="nuke-armed hack-panel-blink">{{ t('syndicate.nukeArmed') }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useScrambledText } from '../composables/useScrambledText'
import { language, t } from '../i18n'

const CODE_LENGTH = 5
// ms after the window opens
const LOCK_AT_MS = [2500, 4000, 5500, 7000, 8500]
const SPIN_MS = 60
const KEY_MS = 90
const DUMP_MS = 110
const KEY_LINES = 4
const DUMP_ROWS = 30
const BLOCK_COUNT = 60

const randomDigit = () => String(Math.floor(Math.random() * 10))
const hex = length => Array.from({ length }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
const dumpRow = () => ({
  address: `0x${hex(4)}`,
  bytes: Array.from({ length: 6 }, () => hex(2)),
  hit: Math.random() < 0.4 ? Math.floor(Math.random() * 6) : -1
})

const heading = useScrambledText(t('syndicate.nukeHeading'))
const code = Array.from({ length: CODE_LENGTH }, randomDigit)
const digits = ref(Array.from({ length: CODE_LENGTH }, randomDigit))
const locked = ref(0)
const acquired = ref(false)
const keyLines = ref([])
const attempts = ref(Math.floor(Math.random() * 90000))
const rate = ref('8.4')
const blocks = ref(Array.from({ length: BLOCK_COUNT }, () => Math.random() < 0.5))
const dump = ref(Array.from({ length: DUMP_ROWS }, dumpRow))
const timers = []
const intervals = []

const progress = computed(() => Math.round((locked.value / CODE_LENGTH) * 100))
const cracked = computed(() => Math.round((locked.value / CODE_LENGTH) * BLOCK_COUNT))

// { text, match }
function pushKey(match) {
  const text = t('syndicate.nukeKey', { key: `0x${hex(4)}..${hex(2)}`, result: t(match ? 'syndicate.nukeMatch' : 'syndicate.nukeFail') })
  keyLines.value = [...keyLines.value, { text, match }].slice(-KEY_LINES)
}

function lock() {
  digits.value[locked.value] = code[locked.value]
  locked.value++
  pushKey(true)
  if (locked.value < CODE_LENGTH) return
  acquired.value = true
  intervals.forEach(clearInterval)
  digits.value = [...code]
  blocks.value = blocks.value.map(() => true)
}

onMounted(() => {
  intervals.push(setInterval(() => {
    digits.value = digits.value.map((digit, index) => (index < locked.value ? digit : randomDigit()))
    attempts.value += 40000 + Math.floor(Math.random() * 160000)
    rate.value = (7 + Math.random() * 3).toFixed(1)
    blocks.value = blocks.value.map(on => (Math.random() < 0.15 ? !on : on))
  }, SPIN_MS))
  intervals.push(setInterval(() => pushKey(false), KEY_MS))
  intervals.push(setInterval(() => { dump.value = [...dump.value.slice(1), dumpRow()] }, DUMP_MS))
  LOCK_AT_MS.forEach(at => timers.push(setTimeout(lock, at)))
})

onUnmounted(() => {
  intervals.forEach(clearInterval)
  timers.forEach(clearTimeout)
})
</script>

<style scoped>
.nuke-target {
  margin-bottom: 0.4em;
  opacity: 0.85;
}

.nuke-digits {
  display: flex;
  justify-content: center;
  gap: 0.5em;
  margin: 0.6em 0;
  font-size: clamp(14px, 1.9cqw, 26px);
}

.nuke-digit {
  width: 1.4em;
  padding: 0.3em 0;
  text-align: center;
  color: #000;
  background: rgba(0, 0, 0, 0.18);
}

.nuke-digit.is-locked {
  color: #ff3030;
  background: #000;
}

.nuke-progress-row {
  display: grid;
  grid-template-columns: 1fr 4em;
  align-items: center;
  gap: 0.6em;
  text-align: right;
}

.nuke-counters {
  display: flex;
  justify-content: space-between;
  margin: 0.6em 0 0.5em;
}

.nuke-blocks {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 2px;
}

.nuke-blocks span {
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.15);
}

.nuke-blocks span.is-on {
  background: rgba(0, 0, 0, 0.45);
}

.nuke-blocks span.is-cracked {
  background: #000;
}

.nuke-blocks.is-done span {
  background: #26854c;
}

.nuke-dump {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  margin-top: 0.6em;
  white-space: nowrap;
  opacity: 0.8;
}

.nuke-dump span {
  margin-right: 0.55em;
}

.nuke-address {
  opacity: 0.7;
}

.nuke-dump .is-hit {
  color: #ff3030;
  background: #000;
}

.nuke-keys {
  margin-top: 0.5em;
  min-height: 6.4em;
}

.nuke-keys .is-match {
  color: #ff3030;
  background: #000;
}

.nuke-status {
  margin-top: 0.4em;
}

.nuke-status.is-done {
  animation: hack-panel-blink 0.8s steps(2) infinite;
}

.nuke-armed {
  margin-top: 0.4em;
  padding: 0.2em 0;
  color: #ff3030;
  background: #000;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .nuke-status.is-done {
    animation: none;
  }
}
</style>
