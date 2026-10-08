<template>
  <div class="panel-status">
    <span class="panel-status-left"><slot name="left" /></span>
    <span class="panel-status-right"><slot name="right" /></span>
  </div>
</template>

<style scoped>
.panel-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--ui-text);
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.panel-status-left {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-status-right {
  flex-shrink: 0;
  color: var(--ui-dim);
}
</style>
