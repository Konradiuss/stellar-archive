<template>
  <div class="editor-dialog-backdrop" @click.self="close">
    <section class="editor-dialog editor-publish" role="dialog" aria-modal="true" :aria-label="t('editor.publishTitle')" @keydown.esc="close">
      <h2 class="editor-heading">{{ t('editor.publishTitle') }}</h2>
      <p class="editor-hint">{{ t('editor.publishNote') }}</p>
      <ul class="publish-files">
        <li v-for="path in editor.changedFiles" :key="path">{{ path }}</li>
      </ul>

      <form class="publish-form" @submit.prevent="send(false)">
        <label class="editor-field">
          <span>{{ t('editor.repo') }}</span>
          <input v-model="settings.repo" class="editor-input publish-repo" autocomplete="off" spellcheck="false" />
        </label>
        <div class="publish-pair">
          <label class="editor-field">
            <span>{{ t('editor.branch') }}</span>
            <input v-model="settings.branch" class="editor-input publish-branch" autocomplete="off" spellcheck="false" />
          </label>
          <label class="editor-field">
            <span>{{ t('editor.folder') }}</span>
            <input v-model="settings.folder" class="editor-input publish-folder" autocomplete="off" spellcheck="false" />
          </label>
        </div>
        <label class="editor-field">
          <span>{{ t('editor.token') }}</span>
          <input v-model="editor.token" class="editor-input publish-token" type="password" autocomplete="off" spellcheck="false" />
        </label>
        <p class="editor-hint">{{ t('editor.tokenHint') }}</p>
        <label class="editor-check"><input v-model="editor.rememberToken" type="checkbox" class="publish-remember" /> {{ t('editor.remember') }}</label>
        <p v-if="editor.rememberToken" class="editor-hint publish-remember-hint">{{ t('editor.rememberHint') }}</p>
        <label class="editor-field">
          <span>{{ t('editor.message') }}</span>
          <input v-model="message" class="editor-input publish-message" autocomplete="off" />
        </label>

        <div class="publish-log" aria-live="polite">
          <div v-for="(step, index) in editor.publishLog" :key="index">{{ t(step.key, step.params) }}</div>
          <template v-if="result?.status === 'done'">
            <div class="is-ok">{{ t('editor.published') }}</div>
            <div class="editor-actions">
              <a class="editor-button" :href="result.url" target="_blank" rel="noopener">{{ t('editor.commitLink') }}</a>
              <a class="editor-button" :href="result.actions" target="_blank" rel="noopener">{{ t('editor.buildLink') }}</a>
            </div>
          </template>
          <template v-else-if="result?.status === 'conflict'">
            <div class="is-warn publish-conflict">{{ t('editor.conflict', { files: result.conflicts.join(', ') }) }}</div>
            <div class="editor-actions">
              <button type="button" class="editor-button is-danger publish-overwrite" @click="send(true)">{{ t('editor.overwrite') }}</button>
              <button type="button" class="editor-button" @click="close">{{ t('editor.cancel') }}</button>
            </div>
          </template>
          <div v-else-if="result?.status === 'failed'" class="is-error publish-error">{{ t(result.key, result.params) }}</div>
        </div>

        <div v-if="editor.mapBroken" class="is-error publish-blocked" role="alert">{{ t('editor.publishBlocked') }}</div>
        <div class="editor-actions">
          <button type="submit" class="editor-button is-primary publish-send" :disabled="editor.publishing || !editor.changedFiles.length || editor.mapBroken">{{ t('editor.send') }}</button>
          <button type="button" class="editor-button publish-close" @click="close">{{ t('editor.close') }}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { playSound } from '../sound'

const emit = defineEmits(['close'])
const editor = useEditorStore()
const settings = editor.publishSettings
const message = ref(t('editor.defaultMessage'))
const result = computed(() => editor.publishResult)
// A conflict needs an answer, so it beeps as an error.
watch(() => result.value?.status, status => {
  if (status === 'done') playSound('success')
  else if (status === 'failed' || status === 'conflict') playSound('error')
})

const send = overwrite => editor.publish({ message: message.value, overwrite })
editor.check()

function close() {
  if (editor.publishing) return
  editor.publishResult = null
  editor.publishLog = []
  emit('close')
}
</script>

<style scoped>
.publish-files {
  margin: 0 0 16px;
  padding: 8px 12px 8px 28px;
  border: 1px solid var(--ed-border);
  border-radius: var(--ed-radius);
  font-family: var(--ed-mono);
  font-size: 12.5px;
  color: var(--ed-accent-text);
  background: var(--ed-bg);
}

.publish-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.publish-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--ed-mono);
  font-size: 12.5px;
  line-height: 1.6;
}

.publish-log:empty {
  display: none;
}

@media (max-width: 520px) {
  .publish-pair {
    grid-template-columns: 1fr;
  }
}
</style>
