<template>
  <div class="hack-panel hack-crew">
    <div class="hack-panel-title">{{ t('syndicate.crewTitle') }}</div>
    <div class="hack-panel-body">
      <div class="hack-panel-heading">{{ heading }}</div>
      <div class="crew-sensors">
        <span class="hack-panel-blink">{{ t('syndicate.crewSensors') }}</span>
        <span>{{ t('syndicate.crewTracking') }}</span>
      </div>

      <div class="crew-list">
        <div
          v-for="(member, index) in crew"
          :key="index"
          class="crew-row"
          :class="{ 'is-critical': critical.includes(index) && !flat.includes(index), 'is-dead': dead.includes(index) }"
        >
          <span class="crew-post">{{ member.post }}</span>
          <span class="crew-name">{{ member.name }}</span>
          <span class="crew-bpm">{{ bpm[index] }}</span>
          <span v-if="dead.includes(index)" class="crew-status">{{ t('syndicate.crewDeceased') }}</span>
          <svg v-else class="crew-pulse" viewBox="0 0 48 10" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              class="crew-pulse-line"
              :class="{ 'is-flat': flat.includes(index) }"
              :style="flat.includes(index) ? null : member.pace"
              :points="flat.includes(index) ? FLAT : PULSE"
              fill="none"
              stroke="#000"
              stroke-width="1.5"
              shape-rendering="crispEdges"
            />
          </svg>
        </div>
        <div class="crew-sweep" aria-hidden="true"></div>
      </div>

      <div class="crew-count">{{ t('syndicate.crewLifeSigns', { alive: crew.length - dead.length, total: crew.length }) }}</div>
      <div class="crew-log">
        <div v-for="line in log" :key="line">{{ line }}</div>
      </div>
      <div v-if="dead.length === crew.length" class="crew-final hack-panel-blink">{{ t('syndicate.crewFinal') }}</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { randomCrew } from '../utils/hackCrew'
import { useScrambledText } from '../composables/useScrambledText'
import { t } from '../i18n'

const CREW_SIZE = 20
// Timed against the lore screen (it opens ~1.9 s in, this window at 0.8 s):
// the last death comes ~0.6 s before the reboot.
const FIRST_DEATH_MS = 1800
const DEATH_EVERY_MS = 300
const CRITICAL_MS = 700
const FLATLINE_MS = 600
const BPM_MS = 250
const LOG_LINES = 4

// Two beats over 48 units, repeated three times so the line loops seamlessly.
const BEAT = [[0, 6], [6, 6], [8, 5], [10, 6], [12, 6], [13, 9], [15, 1], [17, 8], [18, 6], [24, 6]]
const PULSE = [...BEAT, ...BEAT.map(([x, y]) => [x + 24, y]), ...BEAT.map(([x, y]) => [x + 48, y])]
  .map(([x, y]) => `${x},${y}`).join(' ')
const FLAT = '0,6 72,6'

const heading = useScrambledText(t('syndicate.crewHeading'))

const crew = randomCrew(CREW_SIZE).map(member => ({
  ...member,
  pace: { animationDuration: `${(0.8 + Math.random() * 0.7).toFixed(2)}s`, animationDelay: `${(-Math.random()).toFixed(2)}s` }
}))
const between = (min, max) => Math.round(min + Math.random() * (max - min))
const bpm = ref(crew.map(() => between(60, 105)))
const critical = ref([])
const flat = ref([])
const dead = ref([])
const log = ref([])
const timers = []
let beats = null

const later = (callback, at) => timers.push(setTimeout(callback, at))

onMounted(() => {
  beats = setInterval(() => {
    bpm.value = bpm.value.map((_, index) => {
      if (flat.value.includes(index)) return 0
      if (critical.value.includes(index)) return between(150, 210)
      return between(60, 105)
    })
  }, BPM_MS)

  const order = crew.map((_, index) => index).sort(() => Math.random() - 0.5)
  order.forEach((index, step) => {
    const at = FIRST_DEATH_MS + step * DEATH_EVERY_MS
    later(() => { critical.value = [...critical.value, index] }, at)
    later(() => {
      flat.value = [...flat.value, index]
      bpm.value = bpm.value.map((value, row) => (row === index ? 0 : value))
    }, at + CRITICAL_MS)
    later(() => {
      dead.value = [...dead.value, index]
      log.value = [...log.value, `> ${crew[index].name} - ${crew[index].place}`].slice(-LOG_LINES)
    }, at + CRITICAL_MS + FLATLINE_MS)
  })
})

onUnmounted(() => {
  clearInterval(beats)
  timers.forEach(clearTimeout)
})
</script>

<style scoped>
.crew-sensors {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.6em;
}

.crew-list {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border-top: 2px solid #000;
  border-bottom: 2px solid #000;
  padding: 0.3em 0;
}

.crew-row {
  display: grid;
  grid-template-columns: 4.6em minmax(0, 1fr) 2.6em 8.2em;
  align-items: center;
  gap: 0.5em;
  min-height: 1.85em;
}

.crew-post {
  color: #ff3030;
  background: #000;
  text-align: center;
}

.crew-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.crew-bpm {
  text-align: right;
}

.crew-pulse {
  width: 100%;
  height: 1.4em;
  overflow: hidden;
}

.crew-pulse-line {
  stroke: #9de64e;
  animation: crew-beat 1s linear infinite;
}

.crew-pulse-line.is-flat {
  stroke: #000;
  animation: none;
}

@keyframes crew-beat {
  from { transform: translateX(0); }
  to { transform: translateX(-24px); }
}

.crew-row.is-critical {
  animation: crew-critical 0.24s steps(2) infinite;
}

.crew-row.is-critical .crew-pulse-line {
  animation-duration: 0.3s;
}

@keyframes crew-critical {
  0% { background: #000; color: #ff3030; }
  100% { background: transparent; color: #000; }
}

.crew-row.is-dead {
  opacity: 0.55;
}

.crew-row.is-dead .crew-name {
  text-decoration: line-through;
}

.crew-status {
  text-align: right;
}

.crew-sweep {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: rgba(0, 0, 0, 0.45);
  animation: crew-sweep 1.6s linear infinite;
  pointer-events: none;
}

@keyframes crew-sweep {
  from { top: 0; }
  to { top: 100%; }
}

.crew-count {
  margin-top: 0.6em;
}

.crew-log {
  min-height: 6.4em;
  margin-top: 0.4em;
  opacity: 0.85;
}

.crew-log > div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crew-final {
  margin-top: 0.4em;
  padding: 0.2em 0;
  color: #ff3030;
  background: #000;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .crew-pulse-line,
  .crew-row.is-critical,
  .crew-sweep {
    animation: none;
  }
}
</style>
