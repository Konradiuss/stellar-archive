<template>
  <!-- Its own component: the address comes a moment later, and redrawing a form would put
       the map's values back into fields still being typed in. -->
  <img v-if="url" :src="url" alt="" />
  <span v-else class="is-empty" aria-hidden="true"></span>
</template>

<script setup>
import { useEditorFileUrl } from '../composables/useEditorFileUrl'

const props = defineProps({
  // A path of the site or an https:// address.
  source: { type: String, default: null }
})

const url = useEditorFileUrl(() => props.source)
</script>
