<template>
  <div class="draft-banner" role="status">
    <span class="draft-banner-name">{{ t('editor.draftBanner') }}</span>
    <button type="button" class="draft-banner-button banner-editor" @click="toEditor">{{ t('editor.bannerEditor') }}</button>
    <button type="button" class="draft-banner-button banner-leave" @click="leave">{{ t('editor.bannerLeave') }}</button>
  </div>
</template>

<script setup>
import { t } from '../i18n'
import { setPreview } from '../editor/draft'

function toEditor() {
  window.location.hash = '#/edit'
}

function leave() {
  setPreview(false)
  window.location.reload()
}
</script>

<style scoped>
.draft-banner {
  position: fixed;
  top: 8px;
  left: 50%;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 14px;
  transform: translateX(-50%);
  border: 1px solid #d9a33a;
  border-radius: 8px;
  font: 500 13px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #f3e3c0;
  background: #1c1810;
  cursor: default;
}

.draft-banner-name::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: #d9a33a;
}

.draft-banner-button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #5a4a2a;
  border-radius: 6px;
  font: inherit;
  color: #f3e3c0;
  background: #2a2316;
  cursor: pointer;
}

.draft-banner-button:hover,
.draft-banner-button:focus-visible {
  background: #3a301c;
  outline: none;
}

.draft-banner-button:focus-visible {
  box-shadow: 0 0 0 2px #d9a33a;
}
</style>
