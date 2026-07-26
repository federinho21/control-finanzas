<script setup lang="ts">
const modelValue = defineModel<string>({ default: '' })

const emit = defineEmits<{
  send: []
  uploaded: [payload: { filename: string; chunks: number }]
  uploadError: [message: string]
}>()

const { setTempId } = usePlanPreview()

const uploading = ref(false)
const fileRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<{ textarea?: HTMLTextAreaElement } | null>(null)

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

function triggerFilePicker() {
  fileRef.value?.click()
}

function focus() {
  textareaRef.value?.textarea?.focus()
}

defineExpose({ focus })

// Uploads the file to the indexing endpoint.
async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  if (file.size > MAX_FILE_SIZE) {
    emit('uploadError', 'File too large. Maximum size is 5 MB.')
    target.value = ''
    return
  }

  uploading.value = true
  try {
    const docTempId = crypto.randomUUID()

    const form = new FormData()
    form.append('file', file)
    form.append('tempId', docTempId)

    const response = await $fetch<{ filename: string; chunks: number }>('/api/upload', {
      method: 'POST',
      body: form
    })

    setTempId(docTempId)
    emit('uploaded', { filename: response.filename, chunks: response.chunks })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload file.'
    emit('uploadError', message)
  } finally {
    uploading.value = false
    target.value = ''
  }
}

// Preserves quick-submit UX while still allowing multiline prompts with Shift+Enter.
function onTextareaKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') {
    return
  }

  if (event.shiftKey) {
    return
  }

  event.preventDefault()
  emit('send')
}
</script>

<template>
  <div class="flex items-end gap-2">
    <UTextarea
      ref="textareaRef"
      v-model="modelValue"
      class="flex-1 min-w-0"
      size="lg"
      color="neutral"
      variant="outline"
      :rows="1"
      autoresize
      :maxrows="8"
      placeholder="Write an instruction for the Scrum Assistant"
      data-gramm="false"
      data-gramm_editor="false"
      @keydown="onTextareaKeydown"
    />

    <div class="flex gap-2 shrink-0">
      <UButton
        color="neutral"
        variant="soft"
        size="lg"
        icon="i-lucide-paperclip"
        :loading="uploading"
        @click="triggerFilePicker"
      />
      <UButton
        color="primary"
        size="lg"
        icon="i-lucide-send"
        @click="emit('send')"
      />
    </div>

    <input
      ref="fileRef"
      class="hidden"
      type="file"
      accept=".txt,.md,.pdf"
      @change="onFileChange"
    >
  </div>
</template>


